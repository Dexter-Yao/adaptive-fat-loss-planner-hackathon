// ABOUTME: A's authoritative read-only goal, reported-measurement and dated Hall-outlook projection.
// ABOUTME: No calculation replay, interpolation, storage, model call, consent or success probability is introduced here.
import { DateSchema, daysBetween, type GoalSpec } from "../domain/facts";
import type { ModelPoint } from "../domain/forecast";
import { GOAL_TOLERANCE, pointMeetsGoal } from "../planning/goal-policy";
import { activeAcceptance } from "./journey-commands";
import type {
  ForecastViewBinding,
  GoalMetricValue,
  GoalOutlookView,
  GoalProgressView,
  GoalSummaryView,
  MeasurementView,
} from "./goal-progress-contract";
import type { Session } from "./session";

/** Presentation semantics only; numerical tolerance stays owned by planning/goal-policy.ts. */
export const GOAL_PROGRESS_POLICY_VERSION = "goal-progress-2026-10-29-v1";

function summary(s: Session): GoalSummaryView {
  const accepted = activeAcceptance(s),
    first = s.journey.acceptances[0],
    currentDraft = s.journey.drafts.find((d) => d.id === accepted?.draftId),
    firstDraft = s.journey.drafts.find((d) => d.id === first?.draftId);
  if (
    !currentDraft ||
    !firstDraft ||
    currentDraft.binding.sessionId !== s.id ||
    firstDraft.binding.sessionId !== s.id ||
    currentDraft.binding.endsOn < firstDraft.binding.startsOn
  )
    return { goal: { ...s.goal }, period: null, activePlanPeriod: null };
  const startsOn = firstDraft.binding.startsOn,
    endsOn = currentDraft.binding.endsOn,
    targets = s.targetRevisions.filter((t) => t.goalId === s.goal.id),
    dateWasRevised =
      endsOn !== firstDraft.binding.endsOn ||
      (targets.at(-1)?.targetDate === endsOn &&
        targets.some(
          (t, i) => i > 0 && t.targetDate !== targets[i - 1].targetDate,
        ));
  return {
    goal: { ...s.goal },
    period: {
      startsOn,
      endsOn,
      durationDays: daysBetween(startsOn, endsOn),
      endSource: dateWasRevised
        ? "accepted_revision"
        : s.goal.requestedDate === endsOn
          ? "user_requested"
          : "calculator_estimate",
    },
    activePlanPeriod: { startsOn: currentDraft.binding.startsOn, endsOn },
  };
}

function measurements(s: Session, today: string, metric: GoalSpec["kind"]) {
  const profile = s.profile;
  const baseline: MeasurementView =
    profile.startDate > today
      ? {
          status: "not_recorded",
          metric,
          reason: "The baseline report is future-dated.",
        }
      : metric === "weight"
        ? {
            status: "available",
            reading: { metric, value: profile.weightKg, unit: "kg" },
            date: profile.startDate,
            source: "profile_report",
            method: null,
          }
        : profile.bodyFat === null
          ? {
              status: "not_recorded",
              metric,
              reason:
                "No starting body-fat measurement was reported; the model estimate is not a measurement.",
            }
          : {
              status: "available",
              reading: {
                metric,
                value: profile.bodyFat.percent,
                unit: "percent",
              },
              date: profile.startDate,
              source: "profile_report",
              method: profile.bodyFat.method,
            };
  let latest = baseline;
  // Each metric has its own last report date. Never sort/mutate logs or let a note clear a reading.
  for (const log of s.logs) {
    if (
      log.date > today ||
      log.date < profile.startDate ||
      (latest.status === "available" && log.date < latest.date)
    )
      continue;
    if (metric === "weight" && log.weightKg !== null)
      latest = {
        status: "available",
        reading: { metric, value: log.weightKg, unit: "kg" },
        date: log.date,
        source: "observation",
        method: null,
      };
    if (metric === "body_fat" && log.bodyFat !== null)
      latest = {
        status: "available",
        reading: { metric, value: log.bodyFat.percent, unit: "percent" },
        date: log.date,
        source: "observation",
        method: log.bodyFat.method,
      };
  }
  return { baseline, latest };
}

function metricReading(
  point: ModelPoint,
  metric: GoalSpec["kind"],
): GoalMetricValue | null {
  const value = metric === "weight" ? point.weightKg : point.bodyFatPct;
  if (value === null || !Number.isFinite(value)) return null;
  return metric === "weight"
    ? { metric, value, unit: "kg" }
    : { metric, value, unit: "percent" };
}

function outlook(
  s: Session,
  today: string,
  goal: GoalSummaryView,
): GoalOutlookView {
  const snap = s.snapshot,
    f = snap?.forecast,
    accepted = activeAcceptance(s);
  const binding: ForecastViewBinding = {
    sessionId: s.id,
    sourceRevision: s.sourceRevision,
    acceptedJourneyId: accepted?.id ?? null,
    asOfDate: today,
    snapshotSourceRevision: snap?.sourceRevision ?? null,
    inputHash: f?.inputHash ?? null,
  };
  const unknown = (
    reason: Extract<GoalOutlookView, { status: "unknown" }>["reason"],
    message: string,
  ): GoalOutlookView => ({ status: "unknown", binding, reason, message });
  if (
    snap &&
    (snap.context.applicability !== "standard" ||
      snap.context.signals.some((v) => v.kind !== "low_feasibility") ||
      ["paused", "needs_confirmation"].includes(snap.decision.status))
  )
    return unknown(
      "scope_withheld",
      "The current scope or measurement needs review before a goal outlook can be shown.",
    );
  if (
    !s.journey.enabled ||
    !goal.period ||
    !goal.activePlanPeriod ||
    !accepted ||
    !s.targetRevisions.length
  )
    return unknown(
      "no_forecast",
      "Accept a calculator-checked plan before viewing its goal outlook.",
    );
  const deadline =
    goal.period.endSource === "accepted_revision"
      ? goal.period.endsOn
      : s.goal.requestedDate;
  const dateLabel =
    goal.period.endSource === "accepted_revision"
      ? "accepted target date"
      : "requested target date";
  if (deadline !== null && deadline < today)
    return unknown(
      "outside_horizon",
      `The ${dateLabel} (${deadline}) has passed. Review the timeline; saved measurements remain available.`,
    );
  if (!snap || !f)
    return unknown(
      "no_forecast",
      "No forecast is available for the accepted plan. Saved measurements remain available.",
    );
  if (
    snap.sourceRevision !== s.sourceRevision ||
    snap.asOfDate !== today ||
    f.asOfDate !== today ||
    f.baselineDate !== s.profile.startDate ||
    f.targetDate !== goal.period.endsOn ||
    f.inputPolicy.timezone !== s.profile.timezone ||
    (f.conditioning && f.conditioning.cutoff !== today)
  )
    return unknown(
      "stale",
      "The saved forecast does not match the current inputs, date or accepted timeline. Update it before assessing the goal.",
    );
  if (
    s.targetRevisions.some((t) => t.goalId !== s.goal.id) ||
    s.targetRevisions.at(-1)!.targetDate !== goal.period.endsOn
  )
    return unknown(
      "scope_withheld",
      "The accepted numerical history does not match this goal and timeline.",
    );
  const hall = f.modelResults.find((m) => m.id === "hall");
  if (!hall || hall.status !== "ok")
    return unknown(
      "model_failed",
      "The Hall planning model is unavailable. Comparison models cannot replace its goal assessment.",
    );
  if (s.goal.kind === "body_fat" && !hall.composition)
    return unknown(
      "unsupported",
      "The planning output does not support the body-fat goal metric.",
    );
  const future = hall.current.filter(
      (p) => p.date >= today && p.date <= f.projectionDate,
    ),
    arrival =
      future.find(
        (p) =>
          metricReading(p, s.goal.kind) !== null && pointMeetsGoal(p, s.goal),
      )?.date ?? null;
  const common = {
    status: "ready" as const,
    binding,
    model: "hall" as const,
    estimatedArrivalDate: arrival,
    evaluatedThrough: f.projectionDate,
    policyVersion: `${GOAL_PROGRESS_POLICY_VERSION};${f.policyVersion};goal-tolerance=${GOAL_TOLERANCE}`,
  };
  if (!future.length)
    return unknown(
      "outside_horizon",
      "The available Hall outputs do not cover the current date or future dates.",
    );
  if (future.every((p) => metricReading(p, s.goal.kind) === null))
    return unknown(
      "unsupported",
      "The Hall outputs are missing the goal metric.",
    );
  if (deadline === null) {
    if (!arrival)
      return unknown(
        "outside_horizon",
        `No goal-arrival date can be estimated within the existing Hall forecast through ${f.projectionDate}. No later date has been extrapolated.`,
      );
    return {
      ...common,
      projectedAtGoalDate: null,
      deviationAtGoalDate: null,
      arrivalDelayDays: null,
      assessment: "on_track",
      reason:
        "Hall projects attainment within the computed range under the accepted-plan assumptions. This is an estimate, not a user deadline or a probability.",
    };
  }
  // Explicit accepted extensions replace the working deadline, not the original request in GoalSpec.
  const anchor = deadline,
    point = future.find((p) => p.date === anchor);
  if (!point)
    return unknown(
      "outside_horizon",
      `The ${dateLabel} (${anchor}) is outside the available dated Hall outputs. The rolling endpoint is not a substitute.`,
    );
  const reading = metricReading(point, s.goal.kind);
  if (!reading)
    return unknown(
      "unsupported",
      "The dated Hall output is missing the goal metric.",
    );
  const meets = pointMeetsGoal(point, s.goal);
  return {
    ...common,
    projectedAtGoalDate: { date: anchor, reading },
    deviationAtGoalDate:
      reading.metric === "weight"
        ? { metric: "weight", value: reading.value - s.goal.value, unit: "kg" }
        : {
            metric: "body_fat",
            value: reading.value - s.goal.value,
            unit: "percentage_points",
          },
    arrivalDelayDays: arrival === null ? null : daysBetween(anchor, arrival),
    assessment: meets ? "on_track" : "needs_review",
    reason: meets
      ? `At the ${dateLabel}, Hall's conditional projection meets the goal within the existing planning tolerance. This is not a success probability.`
      : `At the ${dateLabel}, Hall's conditional projection is above the goal tolerance. Review the assumptions or timeline; no accepted targets have been changed.`,
  };
}

/**
 * Project validated Session facts without changing them. `today` is the session-local calendar date.
 * Display measurements use `metric`; the outlook always uses GoalSpec.kind and the accepted deadline.
 * An undated calculator horizon is not a deadline. Only explicit accepted date revisions become one.
 * Arrival searches use existing future/current-date Hall points and the shared goal tolerance only.
 * `needs_review` describes goal feasibility, not coach-call eligibility or permission to change targets.
 */
export function selectGoalProgress(
  s: Session,
  today: string,
  metric: GoalSpec["kind"] = s.goal.kind,
): GoalProgressView {
  DateSchema.parse(today);
  const goal = summary(s);
  return {
    summary: goal,
    ...measurements(s, today, metric),
    outlook: outlook(s, today, goal),
  };
}
