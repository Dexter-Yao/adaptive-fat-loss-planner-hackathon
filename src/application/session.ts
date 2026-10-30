// ABOUTME: The single browser session owns facts, dated targets and user-controlled action arrangements.
// ABOUTME: Pure commands keep record saving independent of Agent success and reject stale responses.
import { z } from "zod";
import {
  InitializationReviewSchema,
  type InitializationReview,
} from "../domain/initialization";
import {
  ProfileFactsSchema,
  GoalSpecSchema,
  PlanningPreferencesSchema,
  type GoalSpec,
  type PlanningPreferences,
  endpoint,
  DateSchema,
  DailyObservationSchema,
  TargetRevisionSchema,
  WeeklyActionPlanSchema,
  PlanningSnapshotSchema,
  CoachResultSchema,
  CoachRequestSchema,
  ActionChangeSchema,
  ActionDraftSchema,
  upsertDailyObservation,
  addDays,
  fourWeekStarts,
  type ProfileFacts,
  type DailyObservation,
  type ActionDraft,
  type WeeklyAction,
  type CoachRequest,
  type CoachResult,
  type PlanningSnapshot,
} from "../domain/contracts";

import { adviceContextKey } from "./advice-context";
import { JourneyFlowSchema, emptyJourneyFlow } from "../domain/workflow";
import { ReplanningMetadataSchema } from "../domain/replanning";
import { ForecastDisplaySchema } from "./forecast-display";
export const SessionCoreSchema = z
  .object({
    version: z.literal(6),
    journey: JourneyFlowSchema,
    id: z.string().min(1),
    agentReviewedContextKey: z.string().nullable().default(null),
    sourceRevision: z.number().int().nonnegative(),
    actionsRevision: z.number().int().nonnegative(),
    profile: ProfileFactsSchema,
    goal: GoalSpecSchema,
    preferences: PlanningPreferencesSchema,
    initializationReview: InitializationReviewSchema.nullable().default(null),
    historicalAnalysis: z.unknown().nullable().default(null),
    assumptionHistory: z
      .array(
        z.object({
          preferences: PlanningPreferencesSchema,
          snapshot: PlanningSnapshotSchema,
        }),
      )
      .default([]),
    logs: z.array(DailyObservationSchema).max(366),
    targetRevisions: z.array(TargetRevisionSchema).max(30),
    weeklyPlans: z.array(WeeklyActionPlanSchema).max(60),
    snapshot: PlanningSnapshotSchema.nullable(),
    previousSnapshot: PlanningSnapshotSchema.nullable(),
    pendingActionChanges: z
      .object({
        baseRevision: z.number().int().nonnegative(),
        sourceRevision: z.number().int().nonnegative(),
        changes: z.array(ActionChangeSchema).max(20),
      })
      .nullable(),
    isExample: z.boolean(),
  })
  .superRefine((s, ctx) => {
    if (
      new Set(s.logs.map((log) => log.date)).size !== s.logs.length ||
      s.logs.some((log) => log.date < s.profile.startDate)
    )
      ctx.addIssue({
        code: "custom",
        path: ["logs"],
        message: "Saved diary dates must be unique and follow the baseline.",
      });
    if (
      new Set(s.weeklyPlans.map((week) => week.weekStart)).size !==
      s.weeklyPlans.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["weeklyPlans"],
        message: "Each week has one authoritative arrangement.",
      });
    const ids = s.weeklyPlans.flatMap((week) =>
      week.actions.map((action) => action.id),
    );
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        path: ["weeklyPlans"],
        message: "Action IDs must be unique.",
      });
    if (s.snapshot && s.snapshot.sourceRevision > s.sourceRevision)
      ctx.addIssue({
        code: "custom",
        path: ["snapshot"],
        message: "An analysis cannot refer to future facts.",
      });
    if (
      s.targetRevisions.length &&
      s.targetRevisions[0].effectiveFrom !== s.profile.startDate
    )
      ctx.addIssue({
        code: "custom",
        path: ["targetRevisions"],
        message: "Target history must begin at the baseline.",
      });
    for (let i = 0; i < s.targetRevisions.length; i++)
      if (
        s.targetRevisions[i].targetDate <= s.targetRevisions[i].effectiveFrom ||
        (i > 0 &&
          s.targetRevisions[i].effectiveFrom <=
            s.targetRevisions[i - 1].effectiveFrom)
      )
        ctx.addIssue({
          code: "custom",
          path: ["targetRevisions", i],
          message:
            "Target revisions must be ordered and retain a future target.",
        });
  });
export type SessionCore = z.infer<typeof SessionCoreSchema>;
// One root document owns the active core, one reversible candidate and nonrecursive archived cores.
export const SessionSchema = SessionCoreSchema.safeExtend({
  forecastDisplay: ForecastDisplaySchema,
  replanning: ReplanningMetadataSchema.extend({ candidate: SessionCoreSchema })
    .nullable()
    .default(null),
  archives: z
    .array(
      z
        .object({
          archivedOn: DateSchema,
          reason: z.literal("replanned"),
          session: SessionCoreSchema,
        })
        .strict(),
    )
    .default([]),
}).superRefine((s, ctx) => {
  const d = s.replanning;
  if (
    d &&
    (d.sourceSessionId !== s.id ||
      d.candidate.id === s.id ||
      d.id !== d.candidate.id ||
      d.candidate.isExample !== s.isExample)
  )
    ctx.addIssue({
      code: "custom",
      path: ["replanning"],
      message:
        "The new-plan candidate must have its own identity and the same active-session namespace.",
    });
  const ids = s.archives.map((a) => a.session.id);
  if (
    new Set(ids).size !== ids.length ||
    ids.includes(s.id) ||
    (d && ids.includes(d.candidate.id))
  )
    ctx.addIssue({
      code: "custom",
      path: ["archives"],
      message: "Archived sessions retain distinct historical identities.",
    });
});
export type Session = z.infer<typeof SessionSchema>;
const id = () => crypto.randomUUID();
export function createSession(
  profile: ProfileFacts,
  goal: GoalSpec,
  preferences: PlanningPreferences,
  logs: DailyObservation[] = [],
  isExample = false,
  initializationReview: InitializationReview | null = null,
): Session {
  return SessionSchema.parse({
    version: 6,
    journey: emptyJourneyFlow(),
    id: id(),
    sourceRevision: 0,
    actionsRevision: 0,
    profile,
    goal,
    preferences,
    logs,
    targetRevisions: [],
    weeklyPlans: [],
    snapshot: null,
    previousSnapshot: null,
    pendingActionChanges: null,
    isExample,
    initializationReview,
  });
}
export function buildCoachRequest(
  s: Session,
  today: string,
  action: CoachRequest["action"] = "update",
  proposalId: string | null = null,
): CoachRequest {
  const f = s.snapshot?.forecast;
  return CoachRequestSchema.parse({
    action,
    sessionId: s.id,
    sourceRevision: s.sourceRevision,
    actionsRevision: s.actionsRevision,
    asOfDate: today,
    profile: s.profile,
    goal: s.goal,
    preferences: s.preferences,
    logs: s.logs,
    targetRevisions: s.targetRevisions,
    weeklyPlans: s.weeklyPlans,
    previousExplanation: s.snapshot?.explanation ?? null,
    previousNumbers: f
      ? {
          dailyCalories: s.targetRevisions.at(-1)?.dailyCalories ?? null,
          targetDate: f.targetDate,
          projectedWeightKg: endpoint(f)?.weightKg ?? null,
        }
      : null,
    acceptProposalId: proposalId,
  });
}
export function saveDailyRecord(
  s: Session,
  raw: DailyObservation,
  today: string,
): Session {
  const record = DailyObservationSchema.parse(raw);
  const hasFood =
    record.intake?.mode === "daily_total" ||
    (record.intake?.mode === "meals" &&
      (record.intake.extrasKcal > 0 ||
        record.intake.entries.some((e) => e.status !== "unknown")));
  if (
    !s.logs.some((log) => log.date === record.date) &&
    record.weightKg === null &&
    record.bodyFat === null &&
    record.steps === null &&
    !hasFood &&
    record.activity === null &&
    !record.notes.trim()
  )
    throw new Error(
      "Add a measurement, completed-day total, activity or short note.",
    );
  const logs = upsertDailyObservation(s.logs, record);
  if (JSON.stringify(logs) === JSON.stringify(s.logs)) return s;
  const next = {
    ...s,
    logs,
    sourceRevision: s.sourceRevision + 1,
    pendingActionChanges: null,
  };
  buildCoachRequest(next, today);
  return SessionSchema.parse(next);
}
export function savePreferences(
  s: Session,
  preferences: PlanningPreferences,
  today: string,
): Session {
  const next = PlanningPreferencesSchema.parse(preferences);
  if (next.mealSchedules[0].effectiveFrom !== s.profile.startDate)
    throw new Error("The eating pattern must start at the original baseline.");
  for (const old of s.preferences.mealSchedules.filter(
    (m) => m.effectiveFrom < today,
  ))
    if (
      JSON.stringify(
        next.mealSchedules.find((m) => m.effectiveFrom === old.effectiveFrom),
      ) !== JSON.stringify(old)
    )
      throw new Error(
        "Historical eating patterns are preserved. Choose a new effective date.",
      );
  buildCoachRequest({ ...s, preferences: next }, today);
  if (JSON.stringify(next) === JSON.stringify(s.preferences)) return s;
  const archive =
    s.snapshot?.forecast &&
    !s.assumptionHistory.some(
      (h) => h.snapshot.forecast?.inputHash === s.snapshot!.forecast!.inputHash,
    )
      ? [{ preferences: s.preferences, snapshot: s.snapshot }]
      : [];
  return SessionSchema.parse({
    ...s,
    preferences: next,
    assumptionHistory: [...s.assumptionHistory, ...archive],
    sourceRevision: s.sourceRevision + 1,
    pendingActionChanges: null,
  });
}
function protectedDates(action: WeeklyAction, today: string): string[] {
  return action.dates.filter(
    (date) =>
      date < today || action.checks.some((check) => check.date === date),
  );
}
export function editAction(
  s: Session,
  weekStart: string,
  actionId: string | null,
  raw: ActionDraft | null,
  today: string,
  userEdit = true,
): Session {
  const week = s.weeklyPlans.find((week) => week.weekStart === weekStart);
  if (!week) throw new Error("This week has not been generated yet.");
  const draft = raw ? ActionDraftSchema.parse(raw) : null;
  if (
    draft?.dates.some(
      (date) =>
        date < today || date < weekStart || date > addDays(weekStart, 6),
    )
  )
    throw new Error("Choose remaining dates in this calendar week.");
  const existing = actionId
    ? week.actions.find((action) => action.id === actionId)
    : null;
  if (actionId && !existing) throw new Error("That action no longer exists.");
  const keep = existing ? protectedDates(existing, today) : [];
  if (existing && keep.length === existing.dates.length)
    throw new Error(
      "Past and checked occurrences are preserved. You can correct their completion status.",
    );
  if (draft?.dates.some((date) => keep.includes(date)))
    throw new Error(
      "A checked occurrence cannot be replaced. Choose another date or correct its check first.",
    );
  let actions = week.actions.filter((action) => action.id !== actionId);
  if (existing && keep.length)
    actions.push({
      ...existing,
      dates: keep,
      checks: existing.checks.filter((check) => keep.includes(check.date)),
    });
  if (draft)
    actions.push({
      ...draft,
      id: existing && !keep.length ? existing.id : id(),
      checks: [],
      editedByUser: userEdit || existing?.editedByUser || false,
    });
  return SessionSchema.parse({
    ...s,
    weeklyPlans: s.weeklyPlans.map((item) =>
      item.weekStart === weekStart ? { ...item, actions } : item,
    ),
    actionsRevision: s.actionsRevision + 1,
    pendingActionChanges: null,
  });
}
export function checkAction(
  s: Session,
  actionId: string,
  date: string,
  status: "done" | "skipped" | null,
  today: string,
): Session {
  const action = s.weeklyPlans
    .flatMap((week) => week.actions)
    .find((action) => action.id === actionId);
  if (!action || !action.dates.includes(date))
    throw new Error("Choose a scheduled occurrence.");
  if (date > today)
    throw new Error(
      "Future arrangements cannot be marked as already completed.",
    );
  return SessionSchema.parse({
    ...s,
    actionsRevision: s.actionsRevision + 1,
    pendingActionChanges: null,
    weeklyPlans: s.weeklyPlans.map((week) => ({
      ...week,
      actions: week.actions.map((item) =>
        item.id === actionId
          ? {
              ...item,
              checks: [
                ...item.checks.filter((check) => check.date !== date),
                ...(status ? [{ date, status }] : []),
              ],
            }
          : item,
      ),
    })),
  });
}
export function receiveCoachResult(
  s: Session,
  request: CoachRequest,
  raw: CoachResult,
  today: string,
): Session {
  if (s.journey.enabled)
    throw new Error(
      "Use the journey workflow to review and explicitly accept targets and arrangements.",
    );
  const result = CoachResultSchema.parse(raw);
  if (
    s.id !== request.sessionId ||
    result.sessionId !== s.id ||
    request.sourceRevision !== s.sourceRevision ||
    result.sourceRevision !== request.sourceRevision ||
    result.asOfDate !== today ||
    request.asOfDate !== today
  )
    throw new Error(
      "The inputs changed while this analysis was running. Your newer records are kept; refresh the analysis.",
    );
  buildCoachRequest({ ...s, targetRevisions: result.targetRevisions }, today);
  if (
    request.targetRevisions.length &&
    JSON.stringify(
      result.targetRevisions.slice(0, request.targetRevisions.length),
    ) !== JSON.stringify(request.targetRevisions)
  )
    throw new Error("A result cannot rewrite accepted target history.");
  if (
    request.action !== "accept" &&
    request.targetRevisions.length &&
    JSON.stringify(result.targetRevisions) !==
      JSON.stringify(request.targetRevisions)
  )
    throw new Error("Only explicit acceptance may change existing targets.");
  const changed =
      JSON.stringify(s.targetRevisions) !==
      JSON.stringify(result.targetRevisions),
    revision = s.sourceRevision + (changed ? 1 : 0);
  const {
    sessionId: _session,
    actionsRevision: _actions,
    targetRevisions: _targets,
    newWeeks,
    actionChanges,
    ...snapshotFields
  } = result;
  const snapshot: PlanningSnapshot = {
    ...snapshotFields,
    sourceRevision: revision,
  };
  let weeklyPlans = s.weeklyPlans,
    actionsRevision = s.actionsRevision,
    pendingActionChanges: Session["pendingActionChanges"] = null;
  if (
    result.actionsRevision === request.actionsRevision &&
    s.actionsRevision === request.actionsRevision
  ) {
    for (const week of newWeeks) {
      if (
        weeklyPlans.some((item) => item.weekStart === week.weekStart) ||
        !fourWeekStarts(today).includes(week.weekStart) ||
        week.actions.some((action) => action.dates.some((date) => date < today))
      )
        throw new Error(
          "New weeks cannot overwrite an existing or historical arrangement.",
        );
      weeklyPlans = [
        ...weeklyPlans,
        {
          ...week,
          actions: week.actions.map((action) => ({
            ...action,
            id: id(),
            checks: [],
            editedByUser: false,
          })),
        },
      ];
    }
    if (newWeeks.length) actionsRevision++;
    if (actionChanges.length)
      pendingActionChanges = {
        baseRevision: actionsRevision,
        sourceRevision: revision,
        changes: actionChanges,
      };
  }
  return SessionSchema.parse({
    ...s,
    sourceRevision: revision,
    targetRevisions: result.targetRevisions,
    weeklyPlans,
    actionsRevision,
    snapshot,
    agentReviewedContextKey:
      result.provider && result.explanation
        ? adviceContextKey(s)
        : s.agentReviewedContextKey,
    previousSnapshot: s.snapshot?.forecast ? s.snapshot : s.previousSnapshot,
    pendingActionChanges,
  });
}
export function acceptActionChanges(s: Session, today: string): Session {
  const pending = s.pendingActionChanges;
  if (
    !pending ||
    pending.baseRevision !== s.actionsRevision ||
    pending.sourceRevision !== s.sourceRevision ||
    s.snapshot?.asOfDate !== today
  )
    throw new Error(
      "These suggestions are no longer current. Refresh before applying them.",
    );
  let next = s;
  for (const change of pending.changes)
    next = editAction(
      next,
      change.weekStart,
      change.actionId,
      change.replacement,
      today,
      false,
    );
  return SessionSchema.parse({ ...next, pendingActionChanges: null });
}
