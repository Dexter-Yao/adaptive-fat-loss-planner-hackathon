// ABOUTME: Verify review-data scope, causal input prefixes and honest comparison/calibration denominators.
// ABOUTME: All judgments/receipts in these unit tests are synthetic test fixtures, never human annotations or inference evidence.
import test from "node:test";
import assert from "node:assert/strict";
import {
  reviewSuite,
  ReviewSuiteSchema,
  journeyPrefix,
} from "../src/evaluation/review-suite";
import { compareReceipts, comparisonRow } from "../src/evaluation/comparison";
import { judgeCalibration } from "../src/evaluation/judge-calibration";

test("six approved journeys remain fictional, complete and measurement-only; judge criteria remain uncalibrated", () => {
  assert.equal(reviewSuite.status, "cases_approved");
  assert.equal(reviewSuite.rubric.length, 4);
  assert.equal(reviewSuite.cases.length, 6);
  assert.equal(
    reviewSuite.cases.reduce((n, c) => n + c.checkIns.length, 0),
    42,
  );
  for (const c of reviewSuite.cases) {
    assert.equal(c.initialInput.profile.eligibility, "standard");
    for (const e of c.checkIns) assert.ok(e.measurement.date <= "2026-10-29");
  }
  const injected = structuredClone(reviewSuite) as any;
  injected.cases[0].checkIns[0].measurement.intake = {
    mode: "daily_total",
    kcal: 1500,
  };
  assert.equal(ReviewSuiteSchema.safeParse(injected).success, false);
  assert.equal(
    ReviewSuiteSchema.safeParse({ ...reviewSuite, status: "approved" }).success,
    false,
  );
});
test("reject reversed dates and unresolved case/rubric references", () => {
  const bad = structuredClone(reviewSuite);
  bad.cases[0].checkIns[1].measurement.date =
    bad.cases[0].checkIns[0].measurement.date;
  assert.equal(ReviewSuiteSchema.safeParse(bad).success, false);
  const unknown = structuredClone(reviewSuite);
  unknown.cases[0].criteria.push("unreviewed_metric");
  assert.equal(ReviewSuiteSchema.safeParse(unknown).success, false);
});
test("setup cannot see later feedback; progress cannot see later measurements", () => {
  const c = reviewSuite.cases.find((c) => c.id === "J04")!;
  const setup = journeyPrefix(c, "2026-06-29");
  assert.equal(setup.initialFeedback, null);
  assert.equal(setup.checkIns.length, 0);
  const before = journeyPrefix(c, "2026-06-29", "follow_up");
  assert.equal(before.checkIns.at(-1)?.measurement.weightKg, 83.8);
  assert.equal(before.checkIns.length, 4);
  assert.ok(!JSON.stringify(before).includes('"date":"2026-07-02"'));
  assert.equal(c.checkIns.length, 7);
});
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fixtureReceipt = (failed = false, requestHash = "same") => ({
  caseId: "synthetic-unit-case",
  datasetVersion: "synthetic-unit-v1",
  configurationHash: failed ? "config-b" : "config-a",
  sourceCommit: "unit",
  requestHash,
  requestedModel: "synthetic-unit-model",
  elapsedMs: 100,
  scope: "Fictional unit test; not inference evidence",
  request: { stage: "generate" },
  result: failed ? null : { synthetic: true },
  error: failed ? "test failure" : null,
  summaries: [
    {
      stage: "journey_generation",
      operation: "present_journey",
      status: failed ? "failed" : "completed",
      elapsedMs: 90,
      submissions: 1,
      rejectedSubmissions: failed ? 1 : 0,
      usage: failed
        ? null
        : { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      configuration: { model: "synthetic-unit-model" },
      responses: failed
        ? []
        : [
            {
              model: "synthetic-unit-model",
              responseId: "synthetic",
              finishReason: "tool_calls",
            },
          ],
    },
  ],
  traces: [
    {
      promptVersion: "synthetic-unit-prompt",
      contextHash: "synthetic-unit-context",
      schemaHash: "synthetic-unit-schema",
    },
  ],
  traceExport: {
    runId: uuid(1),
    status: "synthetic-unit-test",
    content: "fictional",
  },
});
test("failed/unknown consumption stays failed/unknown; matching is exact", () => {
  const row = comparisonRow(fixtureReceipt(true));
  assert.equal(row.status, "failed");
  assert.equal(row.reportedTokens, null);
  assert.equal(row.firstResponseAccepted, false);
  assert.equal(row.usdCost, null);
  const earlier = fixtureReceipt() as any;
  delete earlier.summaries[0].responses[0].finishReason;
  assert.equal(comparisonRow(earlier).status, "completed");
  const matched = compareReceipts([fixtureReceipt(), fixtureReceipt(true)]);
  assert.equal(matched.cases.length, 1);
  assert.equal(matched.cases[0].matchedCandidates, 2);
  const unmatched = compareReceipts([
    fixtureReceipt(),
    fixtureReceipt(true, "different-input"),
  ]);
  assert.equal(unmatched.cases.length, 2);
  assert.ok(
    matched.cases[0].candidates.every((c) => c.qualityVerdict === null),
  );
});
const human = (n: number, verdict: "pass" | "fail" | "unsure") => ({
  rubricVersion: "synthetic-rubric",
  criterionId: "overall",
  annotation: {
    caseId: `synthetic-${n}`,
    runId: uuid(n),
    stage: "generate",
    reviewer: "SYNTHETIC UNIT TEST ONLY",
    reviewedAt: "2026-10-29T00:00:00Z",
    verdict,
    critique: "Synthetic test annotation, not Dexter feedback.",
    firstFailingOperation: null,
    failureTags: [],
  },
});
const judge = (n: number, verdict: "pass" | "fail" | "unsure") => ({
  rubricVersion: "synthetic-rubric",
  criterionId: "overall",
  caseId: `synthetic-${n}`,
  candidateRunId: uuid(n),
  judgeRunId: uuid(n + 100),
  judgeConfigurationId: "synthetic-judge",
  verdict,
  critique: "Synthetic prediction, not a model call.",
});
test("binary calibration reports false passes and false fails without approving a judge", () => {
  const r = judgeCalibration(
    [human(1, "fail"), human(2, "pass"), human(3, "fail"), human(4, "pass")],
    [judge(1, "pass"), judge(2, "pass"), judge(3, "fail"), judge(4, "fail")],
  );
  assert.equal(r.falsePass, 1);
  assert.equal(r.falseFail, 1);
  assert.equal(r.resolvedPairs, 4);
  assert.equal(r.agreement, 0.5);
  assert.equal(r.automaticPromotion, false);
  assert.equal(r.status, "not_calibrated");
  assert.equal(judgeCalibration([], []).agreement, null);
  assert.throws(() => judgeCalibration([human(1, "unsure")], []));
  assert.throws(() => judgeCalibration([], [judge(1, "unsure")]));
});
test("judge judgments cannot be matched to another rubric or silently pooled", () => {
  const wrong = { ...judge(1, "pass"), rubricVersion: "other" };
  assert.equal(judgeCalibration([human(1, "pass")], [wrong]).unmatched, 1);
  assert.throws(
    () =>
      judgeCalibration(
        [human(1, "pass"), human(1, "fail")],
        [judge(1, "pass")],
      ),
    /duplicate human/i,
  );
  assert.throws(
    () =>
      judgeCalibration(
        [human(1, "pass"), human(2, "pass")],
        [
          judge(1, "pass"),
          { ...judge(2, "pass"), judgeConfigurationId: "other" },
        ],
      ),
    /one judge configuration/i,
  );
});
