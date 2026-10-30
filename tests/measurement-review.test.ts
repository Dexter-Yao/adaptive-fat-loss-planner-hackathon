// ABOUTME: Trigger correctness for aligned forecasts, sparse measurements and duplicate suppression.
// ABOUTME: Trigger eligibility never constitutes proof of a cause or permission to change accepted targets.
import assert from "node:assert/strict";
import test from "node:test";
import {
  assessMeasurementReview,
  type MeasurementReviewInput,
} from "../src/planning/measurement-review";
function input(): MeasurementReviewInput {
  return {
    asOfDate: "2026-11-11",
    hasChangedMeasurement: true,
    baselineWeightKg: 82,
    reference: {
      inputHash: "a".repeat(64),
      comparisonDate: "2027-01-01",
      weightKg: 77,
      bodyFatPct: 24,
      arrivalDate: "2027-01-01",
    },
    updated: {
      inputHash: "b".repeat(64),
      comparisonDate: "2027-01-01",
      weightKg: 78.2,
      bodyFatPct: 24.5,
      arrivalDate: "2027-01-10",
    },
    numericalDatesSinceAcceptance: ["2026-11-11"],
    bodyFatMethodChanged: false,
    scopeConcern: false,
    pendingReview: false,
    previouslyAssessedHash: null,
    lastCoachDate: null,
    lastReviewedProjection: null,
  };
}
test("a changed forecast triggers assessment, marking one measurement as sparse evidence", () => {
  const d = assessMeasurementReview(input());
  assert.equal(d.eligible, true);
  assert.equal(d.evidence, "single_check_in");
  assert.ok(d.reasons.includes("weight_projection_changed"));
});
test("exactly equal or small projections do not generate a coach request", () => {
  const x = input();
  x.updated = { ...x.reference, inputHash: "b".repeat(64) };
  assert.equal(assessMeasurementReview(x).suppression, "below_threshold");
  x.updated.weightKg += 0.4;
  assert.equal(assessMeasurementReview(x).eligible, false);
});
test("compare to the accepted reference so multiple small changes cannot disappear", () => {
  const x = input();
  x.updated.weightKg = 78.1;
  x.updated.arrivalDate = x.reference.arrivalDate;
  assert.equal(assessMeasurementReview(x).eligible, true);
});
test("body-fat-only evidence and a changed measurement method remain distinct reasons", () => {
  const x = input();
  x.updated = { ...x.reference, inputHash: "b".repeat(64), bodyFatPct: 26.1 };
  x.bodyFatMethodChanged = true;
  assert.deepEqual(assessMeasurementReview(x).reasons, [
    "body_fat_projection_changed",
    "measurement_method_changed",
  ]);
});
test("two distinct dates separated by a week are repeated evidence, same-day duplicates are not", () => {
  const x = input();
  x.numericalDatesSinceAcceptance = ["2026-11-04", "2026-11-11"];
  assert.equal(assessMeasurementReview(x).evidence, "repeated_check_ins");
  x.numericalDatesSinceAcceptance = ["2026-11-11", "2026-11-11"];
  assert.equal(assessMeasurementReview(x).evidence, "single_check_in");
});
test("hash idempotency, an outstanding review and cooldown prevent duplicate automatic calls", () => {
  const x = input();
  x.previouslyAssessedHash = x.updated.inputHash;
  assert.equal(assessMeasurementReview(x).suppression, "already_assessed");
  x.previouslyAssessedHash = null;
  x.pendingReview = true;
  assert.equal(assessMeasurementReview(x).suppression, "review_pending");
  x.pendingReview = false;
  x.lastCoachDate = "2026-11-09";
  assert.equal(assessMeasurementReview(x).suppression, "cooldown");
});
test("a scope concern is not held behind an ordinary numerical cooldown", () => {
  const x = input();
  x.scopeConcern = true;
  x.lastCoachDate = "2026-11-10";
  x.hasChangedMeasurement = false;
  assert.equal(assessMeasurementReview(x).eligible, true);
});
test("cooldown cannot hide a materially new deviation or a newly unreachable goal", () => {
  const x = input();
  x.lastCoachDate = "2026-11-10";
  x.lastReviewedProjection = { ...x.reference, weightKg: 77.1 };
  assert.equal(assessMeasurementReview(x).eligible, true);
  x.lastReviewedProjection = { ...x.updated };
  assert.equal(assessMeasurementReview(x).suppression, "cooldown");
  x.updated.arrivalDate = null;
  assert.equal(assessMeasurementReview(x).eligible, true);
});
test("a note-only update does not masquerade as a numerical update", () => {
  const x = input();
  x.hasChangedMeasurement = false;
  assert.equal(assessMeasurementReview(x).suppression, "no_numerical_change");
});
test("mismatched horizons and future observations are rejected", () => {
  const x = input();
  x.updated.comparisonDate = "2027-02-01";
  assert.throws(() => assessMeasurementReview(x), /same date/);
  x.updated.comparisonDate = x.reference.comparisonDate;
  x.numericalDatesSinceAcceptance = ["2026-11-12"];
  assert.throws(() => assessMeasurementReview(x), /future observations/);
});
test("a previously attainable goal becoming unattainable triggers a feasibility assessment", () => {
  const x = input();
  x.updated = { ...x.reference, inputHash: "b".repeat(64), arrivalDate: null };
  assert.ok(
    assessMeasurementReview(x).reasons.includes("goal_no_longer_reached"),
  );
});
