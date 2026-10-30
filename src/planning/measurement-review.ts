// ABOUTME: Deterministic, versioned eligibility for a coach review after a measurement refresh.
// ABOUTME: Magnitudes trigger assessment, never a diagnosis, an automatic target change or a model call.
import { daysBetween } from "../domain/facts";

export const MEASUREMENT_REVIEW_POLICY = {
  version: "measurement-review-2026-10-28-prototype-1",
  minimumWeightDeltaKg: 1,
  baselineWeightFraction: 0.01,
  bodyFatDeltaPp: 2,
  arrivalDeltaDays: 7,
  cooldownDays: 7,
} as const;

import {
  MeasurementReviewInputSchema,
  type MeasurementReviewInput,
  type MeasurementReviewDecision,
  type MeasurementReviewReason,
} from "../domain/measurement-review";
export type {
  MeasurementReviewInput,
  MeasurementReviewDecision,
} from "../domain/measurement-review";
/** Compare Hall summaries at an identical horizon against the accepted reference. */
export function assessMeasurementReview(
  raw: MeasurementReviewInput,
): MeasurementReviewDecision {
  const x = MeasurementReviewInputSchema.parse(raw),
    p = MEASUREMENT_REVIEW_POLICY;
  if (x.reference.comparisonDate !== x.updated.comparisonDate)
    throw new Error(
      "Compare forecasts at the same date; rolling endpoints are not equivalent.",
    );
  if (
    x.updated.comparisonDate < x.asOfDate ||
    x.numericalDatesSinceAcceptance.some((d) => d > x.asOfDate) ||
    (x.lastCoachDate !== null && x.lastCoachDate > x.asOfDate)
  )
    throw new Error(
      "Review dates cannot use future observations or a past comparison endpoint.",
    );
  const delta = x.updated.weightKg - x.reference.weightKg;
  const bf =
    x.reference.bodyFatPct !== null && x.updated.bodyFatPct !== null
      ? x.updated.bodyFatPct - x.reference.bodyFatPct
      : null;
  const arrival =
    x.reference.arrivalDate && x.updated.arrivalDate
      ? daysBetween(x.reference.arrivalDate, x.updated.arrivalDate)
      : null;
  const reasons: MeasurementReviewReason[] = [];
  const last = x.lastReviewedProjection;
  if (last && last.comparisonDate !== x.updated.comparisonDate)
    throw new Error(
      "Retime the last reviewed projection to the same comparison date before cooldown assessment.",
    );
  if (x.scopeConcern) reasons.push("scope_concern");
  if (
    Math.abs(delta) >=
    Math.max(
      p.minimumWeightDeltaKg,
      p.baselineWeightFraction * x.baselineWeightKg,
    )
  )
    reasons.push("weight_projection_changed");
  if (bf !== null && Math.abs(bf) >= p.bodyFatDeltaPp)
    reasons.push("body_fat_projection_changed");
  if (arrival !== null && Math.abs(arrival) >= p.arrivalDeltaDays)
    reasons.push("arrival_changed");
  if (x.reference.arrivalDate && !x.updated.arrivalDate)
    reasons.push("goal_no_longer_reached");
  if (x.bodyFatMethodChanged) reasons.push("measurement_method_changed");
  const dates = [...new Set(x.numericalDatesSinceAcceptance)].sort();
  const repeated =
    dates.length >= 2 && daysBetween(dates[0], dates.at(-1)!) >= 7;
  const d: MeasurementReviewDecision = {
    policyVersion: p.version,
    eligible: false,
    reasons,
    evidence: repeated ? "repeated_check_ins" : "single_check_in",
    suppression: null,
    weightDeltaKg: delta,
    bodyFatDeltaPp: bf,
    arrivalDeltaDays: arrival,
  };
  const newMaterialChange =
    last !== null &&
    (Math.abs(x.updated.weightKg - last.weightKg) >=
      Math.max(
        p.minimumWeightDeltaKg,
        p.baselineWeightFraction * x.baselineWeightKg,
      ) ||
      (x.updated.bodyFatPct !== null &&
        last.bodyFatPct !== null &&
        Math.abs(x.updated.bodyFatPct - last.bodyFatPct) >= p.bodyFatDeltaPp) ||
      (last.arrivalDate !== null && x.updated.arrivalDate === null) ||
      (last.arrivalDate !== null &&
        x.updated.arrivalDate !== null &&
        Math.abs(daysBetween(last.arrivalDate, x.updated.arrivalDate)) >=
          p.arrivalDeltaDays));
  if (x.previouslyAssessedHash === x.updated.inputHash)
    d.suppression = "already_assessed";
  else if (x.pendingReview) d.suppression = "review_pending";
  else if (x.scopeConcern) d.eligible = true;
  else if (!x.hasChangedMeasurement) d.suppression = "no_numerical_change";
  else if (!reasons.length) d.suppression = "below_threshold";
  else if (
    x.lastCoachDate &&
    daysBetween(x.lastCoachDate, x.asOfDate) < p.cooldownDays &&
    !newMaterialChange &&
    !x.bodyFatMethodChanged &&
    !(last === null && reasons.includes("goal_no_longer_reached"))
  )
    d.suppression = "cooldown";
  else d.eligible = true;
  return d;
}
