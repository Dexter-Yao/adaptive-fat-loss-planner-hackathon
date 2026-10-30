// ABOUTME: Pure commands over the single Session for proposal, feedback, acceptance and check-in history.
// ABOUTME: Facts and targets change only through explicit commands; asynchronous transport owns no session data.
import {
  actionAdviceIssues,
  enforceContext,
  getContextSources,
} from "../domain/context";
import { addDays } from "../domain/facts";
import { BaselineEstimateSchema } from "../domain/forecast";
import type { InitializationReview } from "../domain/initialization";
import {
  JourneyDraftSchema,
  JourneyFeedbackSchema,
  journeyContentIssues,
  nextFeedbackRevision,
  type JourneyContent,
  type JourneyDraft,
  type JourneyFeedback,
} from "../domain/journey";
import {
  CalculationRequestSchema,
  MeasurementUpdateSchema,
  StageRequestSchema,
  type CalculationResponse,
  type MeasurementUpdate,
  type RequestBinding,
  type StageRequest,
} from "../domain/workflow";
import { estimateBaseline } from "../planning/inputs";
import { adviceContextKey } from "./advice-context";
import {
  SessionSchema,
  buildCoachRequest,
  saveDailyRecord,
  type Session,
} from "./session";

export const activeAcceptance = (s: Session) =>
  s.journey.acceptances.at(-1) ?? null;
export function pendingDraft(s: Session): JourneyDraft | null {
  return (
    s.journey.drafts.find((d) => d.id === s.journey.candidateDraftId) ?? null
  );
}
export function newBinding(s: Session, today: string): RequestBinding {
  return {
    requestId: crypto.randomUUID(),
    sessionId: s.id,
    sourceRevision: s.sourceRevision,
    actionsRevision: s.actionsRevision,
    acceptedJourneyId: activeAcceptance(s)?.id ?? null,
    asOfDate: today,
  };
}
export function bindingCurrent(
  s: Session,
  b: RequestBinding,
  today: string,
): boolean {
  return (
    s.id === b.sessionId &&
    s.sourceRevision === b.sourceRevision &&
    s.actionsRevision === b.actionsRevision &&
    (activeAcceptance(s)?.id ?? null) === b.acceptedJourneyId &&
    today === b.asOfDate
  );
}
export function buildCalculationRequest(
  s: Session,
  b: RequestBinding,
  planning = false,
) {
  return CalculationRequestSchema.parse({
    kind: "journey_calculation",
    binding: b,
    profile: s.profile,
    goal: s.goal,
    preferences: s.preferences,
    logs: s.logs,
    targetRevisions: s.targetRevisions,
    revision: planning ? s.journey.revisionRequest : null,
  });
}
export function journeySources(
  s: Session,
  today: string,
): Record<string, string> {
  const sources = Object.fromEntries(
    getContextSources(buildCoachRequest(s, today)).map((v) => [v.id, v.text]),
  );
  return {
    ...sources,
    preferences: s.preferences.foodPreferences,
    context: s.preferences.context,
    work: s.profile.activity.work,
    leisure: s.profile.activity.leisure,
    routines: JSON.stringify(s.profile.activity.routines),
    bodyFat: JSON.stringify(s.profile.bodyFat),
    ...(s.journey.revisionIntent
      ? { revisionIntent: JSON.stringify(s.journey.revisionIntent) }
      : {}),
    ...Object.fromEntries(
      s.journey.feedback.map((f, i) => [`feedback:${i}`, JSON.stringify(f)]),
    ),
  };
}
export function buildStageRequest(
  s: Session,
  b: RequestBinding,
  stage: StageRequest["stage"],
  comparison: StageRequest["comparison"] = null,
): StageRequest {
  const accepted = activeAcceptance(s);
  const acceptedContent = accepted
    ? s.journey.drafts.find((d) => d.id === accepted.draftId)?.content
    : null;
  const review = s.journey.reviews.findLast(
    (r) =>
      r.binding.acceptedJourneyId === accepted?.id &&
      r.binding.sourceRevision === s.sourceRevision &&
      !r.dismissed,
  );
  const calc = s.journey.calculation,
    f = calc?.snapshot.forecast;
  const calculation = calc
    ? {
        binding: calc.binding,
        forecastInputHash: f?.inputHash ?? null,
        targetScheduleHash: calc.targetScheduleHash,
        targetDate: f?.targetDate ?? null,
        baseline: f?.baseline ?? null,
        proposedTargets: calc.proposedTargets,
        decision: calc.snapshot.decision,
        context: calc.snapshot.context,
        assumptions: f?.assumptions ?? [],
        models:
          f?.modelResults.map((m) => ({
            id: m.id,
            status: m.status,
            error: m.error,
            endpoint: m.current.at(-1) ?? null,
          })) ?? [],
        milestones:
          f?.modelResults[0].current
            .filter((_, i, a) => i % 7 === 0 || i === a.length - 1)
            .slice(-54) ?? [],
      }
    : null;
  const sources = journeySources(s, b.asOfDate),
    recent = s.logs.slice(-28),
    recentIds = new Set(recent.map((l) => `log:${l.date}`));
  const evidenceIds = new Set(
    [
      ...(calc?.snapshot.context.constraints.flatMap((c) => c.evidence) ?? []),
      ...(calc?.snapshot.context.signals.flatMap((c) => c.evidence) ?? []),
    ].map((e) => e.sourceId),
  );
  for (const key of Object.keys(sources))
    if (key.startsWith("log:") && !recentIds.has(key) && !evidenceIds.has(key))
      delete sources[key];
  if (s.journey.revisionIntent)
    sources.revisionIntent = JSON.stringify(s.journey.revisionIntent);
  return StageRequestSchema.parse({
    binding: b,
    stage,
    profile: s.profile,
    goal: s.goal,
    preferences: s.preferences,
    sources,
    calculation,
    revisionIntent: s.journey.revisionIntent ?? null,
    previousDraft: stage === "revise" ? pendingDraft(s) : null,
    feedback:
      stage === "revise"
        ? (s.journey.feedback.findLast(
            (f) => f.draftId === pendingDraft(s)?.id,
          ) ?? null)
        : null,
    acceptedDraft:
      stage === "review_progress" && accepted
        ? (s.journey.drafts.find((d) => d.id === accepted.draftId) ?? null)
        : null,
    acceptedStrategy: acceptedContent
      ? {
          headline: acceptedContent.headline,
          summary: acceptedContent.summary,
          phases: acceptedContent.phases,
        }
      : null,
    latestReview: review?.result ?? null,
    weeklyPlans: s.weeklyPlans
      .filter((w) => w.weekStart >= addDays(b.asOfDate, -7))
      .slice(0, 6),
    measurements: recent,
    historyCoverage: {
      totalRecords: s.logs.length,
      includedRecords: recent.length,
      firstIncludedDate: recent[0]?.date ?? null,
    },
    comparison,
  });
}
export function enableJourney(s: Session): Session {
  return SessionSchema.parse({
    ...s,
    journey: { ...s.journey, enabled: true, task: null },
  });
}
export function receiveInterpretation(
  s: Session,
  review: InitializationReview,
): Session {
  if (
    JSON.stringify(review.baseline) !==
    JSON.stringify(BaselineEstimateSchema.parse(estimateBaseline(s.profile)))
  )
    throw new Error(
      "Interpretation cannot replace calculator-owned baseline parameters.",
    );
  const v = review.interpretation;
  if (
    v &&
    (v.work !== s.profile.activity.work ||
      v.leisure !== s.profile.activity.leisure ||
      v.rationale.some(
        (r) =>
          !journeySources(s, s.profile.startDate)[r.sourceId]?.includes(
            r.quote,
          ),
      ))
  )
    throw new Error(
      "Interpretation must retain explicit choices and cite supplied input.",
    );
  return SessionSchema.parse({
    ...s,
    initializationReview: review,
    journey: { ...s.journey, task: null },
  });
}
export function receiveCalculation(
  s: Session,
  result: CalculationResponse,
  planning: boolean,
): Session {
  const archive = !planning && s.snapshot ? [s.snapshot] : [];
  return SessionSchema.parse({
    ...s,
    snapshot: planning ? s.snapshot : result.snapshot,
    previousSnapshot: !planning && s.snapshot ? s.snapshot : s.previousSnapshot,
    journey: {
      ...s.journey,
      task: null,
      calculation: result,
      forecastHistory: [...s.journey.forecastHistory, ...archive],
    },
  });
}
export function receiveDraft(
  s: Session,
  content: JourneyContent,
  b: RequestBinding,
): Session {
  const calc = s.journey.calculation,
    forecast = calc?.snapshot.forecast,
    previous = pendingDraft(s);
  if (!forecast || !calc || calc.snapshot.sourceRevision !== s.sourceRevision)
    throw new Error(
      "Calculate the current candidate before generating a journey.",
    );
  const binding = {
    sessionId: s.id,
    sourceRevision: s.sourceRevision,
    actionsRevision: s.actionsRevision,
    forecastInputHash: forecast.inputHash,
    targetScheduleHash: calc.targetScheduleHash,
    startsOn: b.asOfDate,
    endsOn: forecast.targetDate,
  };
  const issues = journeyContentIssues(
    content,
    binding,
    journeySources(s, b.asOfDate),
    s.preferences.availableTrainingMinutes,
  );
  issues.push(...draftAdviceIssues(content, calc.snapshot.context));
  if (issues.length) throw new Error(issues.join(" "));
  const revision = previous
    ? nextFeedbackRevision(previous.feedbackRevision)
    : 0;
  const d = JourneyDraftSchema.parse({
    id: crypto.randomUUID(),
    binding,
    feedbackRevision: revision,
    revisionIntent: s.journey.revisionIntent ?? null,
    content,
  });
  return SessionSchema.parse({
    ...s,
    journey: {
      ...s.journey,
      task: null,
      candidateDraftId: d.id,
      drafts: [...s.journey.drafts, d],
    },
  });
}

/** Preserve accepted facts: feedback changes candidate preferences/dates, never historical targets. */
export function recordFeedback(
  s: Session,
  raw: JourneyFeedback,
  today: string,
): Session {
  const f = JourneyFeedbackSchema.parse(raw),
    draft = pendingDraft(s);
  if (
    !draft ||
    draft.id !== f.draftId ||
    draft.binding.sourceRevision !== f.sourceRevision ||
    f.sourceRevision !== s.sourceRevision ||
    draft.binding.actionsRevision !== s.actionsRevision
  )
    throw new Error("Feedback belongs to the current, unchanged draft.");
  if (s.journey.feedback.some((x) => x.draftId === draft.id))
    throw new Error(
      "Feedback is already saved. Retry this revision instead of submitting it twice.",
    );
  const preferences = {
    ...s.preferences,
    availableTrainingMinutes:
      f.availableTrainingMinutes ?? s.preferences.availableTrainingMinutes,
  };
  const requested = f.requestedGoalDate;
  const goal =
    requested && !activeAcceptance(s)
      ? { ...s.goal, requestedDate: requested }
      : s.goal;
  const factsChanged =
    preferences.availableTrainingMinutes !==
      s.preferences.availableTrainingMinutes ||
    goal.requestedDate !== s.goal.requestedDate;
  const next = SessionSchema.parse({
    ...s,
    preferences,
    goal,
    // Feedback identity/revision is workflow state; only changed facts invalidate the active snapshot.
    sourceRevision: s.sourceRevision + Number(factsChanged),
    pendingActionChanges: null,
    journey: {
      ...s.journey,
      task: null,
      calculation: null,
      feedback: [...s.journey.feedback, f],
      revisionRequest:
        requested && activeAcceptance(s)
          ? { targetDate: requested, mode: "loss" }
          : s.journey.revisionRequest,
    },
  });
  buildCalculationRequest(next, newBinding(next, today), true);
  return next;
}

export function saveMeasurement(
  s: Session,
  raw: MeasurementUpdate,
  today: string,
): { session: Session; numericalChanged: boolean } {
  const m = MeasurementUpdateSchema.parse(raw),
    old = s.logs.find((l) => l.date === m.date);
  const record = {
    date: m.date,
    weightKg: m.weightKg,
    bodyFat: m.bodyFat,
    notes: m.notes,
    intake: old?.intake ?? null,
    activity: old?.activity ?? null,
    steps: old?.steps ?? null,
  };
  const numericalChanged =
    JSON.stringify([old?.weightKg ?? null, old?.bodyFat ?? null]) !==
    JSON.stringify([m.weightKg, m.bodyFat]);
  let next = saveDailyRecord(s, record, today);
  if (next === s) return { session: s, numericalChanged: false };
  next = SessionSchema.parse({
    ...next,
    journey: {
      ...next.journey,
      calculation: null,
      task: null,
      revisionRequest: null,
    },
  });
  if (!numericalChanged && next.snapshot) {
    const context = enforceContext(buildCoachRequest(next, today)),
      blocked =
        context.applicability !== "standard" ||
        context.signals.some((v) => v.kind !== "low_feasibility");
    next = SessionSchema.parse({
      ...next,
      snapshot: {
        ...next.snapshot,
        sourceRevision: next.sourceRevision,
        context,
        decision: blocked
          ? {
              ...next.snapshot.decision,
              status: "paused",
              code: "scope",
              title: "Review the new information",
              summary:
                context.reason ?? "Loss guidance is withheld pending review.",
              proposal: null,
            }
          : next.snapshot.decision,
      },
    });
  }
  return { session: next, numericalChanged };
}

/** Map an accepted proposal into the existing action owner; edited, checked and past occurrences survive. */
function applyJourneyActions(
  s: Session,
  d: JourneyDraft,
  today: string,
): Session["weeklyPlans"] {
  const weeks = new Map(
    s.weeklyPlans.map((w) => [w.weekStart, { ...w, actions: [...w.actions] }]),
  );
  for (const proposed of d.content.weeks) {
    const old = weeks.get(proposed.weekStart),
      actions = (old?.actions ?? []).flatMap((a) => {
        if (a.editedByUser) return [a];
        const keep = a.dates.filter(
          (date) => date < today || a.checks.some((c) => c.date === date),
        );
        return keep.length
          ? [
              {
                ...a,
                dates: keep,
                checks: a.checks.filter((c) => keep.includes(c.date)),
              },
            ]
          : [];
      });
    for (const a of proposed.actions) {
      const existing = old?.actions.find((x) => x.originKey === a.key);
      if (existing?.editedByUser) continue;
      const dates = a.dates.filter(
        (date) =>
          date >= today &&
          !actions.some((x) => x.originKey === a.key && x.dates.includes(date)),
      );
      if (!dates.length) continue;
      const { key, ...content } = a;
      actions.push({
        ...content,
        dates,
        id:
          existing && !actions.some((x) => x.id === existing.id)
            ? existing.id
            : crypto.randomUUID(),
        originKey: key,
        editedByUser: false,
        checks: [],
      });
    }
    weeks.set(proposed.weekStart, {
      weekStart: proposed.weekStart,
      focus: proposed.focus,
      actions,
      checkIn:
        old?.checkIn && old.checkIn.date < today
          ? old.checkIn
          : proposed.checkIn,
    });
  }
  return [...weeks.values()].sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart),
  );
}
export function acceptDraft(
  s: Session,
  checked: CalculationResponse,
  today: string,
): Session {
  const draft = pendingDraft(s),
    f = checked.snapshot.forecast;
  if (
    !draft ||
    !f ||
    ["paused", "needs_confirmation"].includes(
      checked.snapshot.decision.status,
    ) ||
    draft.binding.sourceRevision !== s.sourceRevision ||
    draft.binding.actionsRevision !== s.actionsRevision ||
    draft.binding.forecastInputHash !== f.inputHash ||
    draft.binding.targetScheduleHash !== checked.targetScheduleHash ||
    draft.binding.startsOn !== today
  )
    throw new Error(
      "The draft is stale or blocked. Recalculate and review before acceptance.",
    );
  if (
    JSON.stringify(
      checked.proposedTargets.slice(0, s.targetRevisions.length),
    ) !== JSON.stringify(s.targetRevisions)
  )
    throw new Error("Acceptance cannot rewrite numerical history.");
  if (
    s.targetRevisions.length &&
    checked.proposedTargets.length > s.targetRevisions.length &&
    checked.proposedTargets.at(-1)!.effectiveFrom !== addDays(today, 1)
  )
    throw new Error("A numerical revision begins tomorrow.");
  const issues = journeyContentIssues(
    draft.content,
    draft.binding,
    journeySources(s, today),
    s.preferences.availableTrainingMinutes,
  );
  issues.push(...draftAdviceIssues(draft.content, checked.snapshot.context));
  if (issues.length) throw new Error(issues.join(" "));
  const revision = s.sourceRevision + 1,
    weeklyPlans = applyJourneyActions(s, draft, today),
    actionsRevision = s.actionsRevision + 1;
  return SessionSchema.parse({
    ...s,
    sourceRevision: revision,
    actionsRevision,
    agentReviewedContextKey: adviceContextKey(s),
    weeklyPlans,
    targetRevisions: checked.proposedTargets,
    snapshot: { ...checked.snapshot, sourceRevision: revision },
    pendingActionChanges: null,
    journey: {
      ...s.journey,
      calculation: null,
      task: null,
      candidateDraftId: null,
      revisionRequest: null,
      acceptanceActionsRevision: actionsRevision,
      acceptances: [
        ...s.journey.acceptances,
        {
          id: crypto.randomUUID(),
          draftId: draft.id,
          acceptedOn: today,
          reference: f,
        },
      ],
      forecastHistory: [
        ...s.journey.forecastHistory,
        ...(s.snapshot ? [s.snapshot] : []),
      ],
    },
  });
}

function draftAdviceIssues(
  content: JourneyContent,
  context: CalculationResponse["snapshot"]["context"],
): string[] {
  return [
    ...actionAdviceIssues(
      {
        kind: "nutrition",
        title: content.headline,
        details: [
          content.summary,
          content.reviewApproach,
          ...content.phases.map((p) => p.focus),
          ...content.weeks.map((w) => w.focus),
        ].join("\n"),
      },
      context,
    ),
    ...content.weeks.flatMap((w) =>
      w.actions.flatMap((a) =>
        actionAdviceIssues(
          { ...a, details: [a.details, a.fallback, a.successCheck].join("\n") },
          context,
        ),
      ),
    ),
  ];
}
