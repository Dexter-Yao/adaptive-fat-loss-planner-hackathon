// ABOUTME: A-to-D read-only goal/measurement presentation contract, implemented by selectGoalProgress.
// ABOUTME: These values are derived views, never another persisted goal or a probability of success.
import type { GoalSpec, ProfileFacts } from "../domain/facts";
import type { JourneyBinding } from "../domain/journey";
import type { RequestBinding } from "../domain/workflow";
export type GoalMetricValue =
  | { metric: "weight"; value: number; unit: "kg" }
  | { metric: "body_fat"; value: number; unit: "percent" };
export type GoalMetricDelta =
  | { metric: "weight"; value: number; unit: "kg" }
  | { metric: "body_fat"; value: number; unit: "percentage_points" };
export type MeasurementView =
  | {
      status: "available";
      reading: GoalMetricValue;
      date: string;
      source: "profile_report" | "observation";
      method: NonNullable<ProfileFacts["bodyFat"]>["method"] | null;
    }
  | { status: "not_recorded"; metric: GoalSpec["kind"]; reason: string };
/**
 * Original GoalSpec is preserved. Whole period begins at the first accepted draft,
 * while activePlanPeriod may begin later after a replacement. Guidance-only updates
 * do not change date provenance. No accepted plan yields null periods.
 */
export interface GoalSummaryView {
  goal: GoalSpec;
  /** Whole goal period: first acceptance start through the current accepted end. */
  period: {
    startsOn: string;
    endsOn: string;
    endSource: "user_requested" | "accepted_revision" | "calculator_estimate";
    /** Elapsed daysBetween(start, end), not inclusive dates or calendar-week count. */
    durationDays: number;
  } | null;
  /** A later accepted revision may start after the whole goal period began. */
  activePlanPeriod: Pick<JourneyBinding, "startsOn" | "endsOn"> | null;
}
export type ForecastViewBinding = Pick<
  RequestBinding,
  "sessionId" | "sourceRevision" | "acceptedJourneyId" | "asOfDate"
> & {
  snapshotSourceRevision: number | null;
  inputHash: string | null;
};
/**
 * Ready values describe conditional Hall predictions, not actual outcomes or probabilities.
 * A dated original request is the anchor until an explicitly accepted date revision replaces it.
 * Undated estimates have no projectedAtGoalDate, deviationAtGoalDate or arrivalDelayDays;
 * if no arrival is found within existing future points, return unknown/outside_horizon.
 * Expired deadlines also return unknown/outside_horizon with an explicit elapsed-date message.
 * Negative arrivalDelayDays means early, zero means the same day, null means not estimated.
 * needs_review is a goal-feasibility presentation state, not coach eligibility or a diagnosis.
 */
export type GoalOutlookView =
  | {
      status: "ready";
      binding: ForecastViewBinding;
      model: "hall";
      projectedAtGoalDate: { date: string; reading: GoalMetricValue } | null;
      /** Projected minus requested value at the same date; not a success probability. */
      deviationAtGoalDate: GoalMetricDelta | null;
      estimatedArrivalDate: string | null;
      arrivalDelayDays: number | null;
      evaluatedThrough: string;
      assessment: "on_track" | "needs_review";
      reason: string;
      policyVersion: string;
    }
  | {
      status: "unknown";
      binding: ForecastViewBinding;
      reason:
        | "no_forecast"
        | "stale"
        | "model_failed"
        | "unsupported"
        | "outside_horizon"
        | "scope_withheld";
      message: string;
    };
export interface GoalProgressView {
  summary: GoalSummaryView;
  baseline: MeasurementView;
  latest: MeasurementView;
  outlook: GoalOutlookView;
}
