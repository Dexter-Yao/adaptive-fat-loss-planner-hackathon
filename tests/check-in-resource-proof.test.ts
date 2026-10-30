// ABOUTME: Reproduces an actual menu-bundle/different-meal fallback binding failure with explicit synthetic text.
// ABOUTME: Error paths help model repair; they do not weaken verbatim source or proposal checks.
import assert from "node:assert/strict";
import test from "node:test";
import {
  coachAssessmentIssues,
  CoachAssessmentSchema,
} from "../src/agent/check-in-reasoning";
import { CoachRecommendationSchema } from "../src/domain/journey";

test("resource repair names each invalid quote and accepts a grounded same-meal alternative", () => {
  const availabilityQuote = "同楼便利店午间有现成米饭、豆腐、煮鸡蛋和沙拉";
  const assessment = CoachAssessmentSchema.parse({
    numerical: "continue_plan",
    practical: "workaround",
    barrierQuote: "食堂停业",
    availabilityQuote,
    primaryResourceQuote: "便利店现成米饭、豆腐、煮鸡蛋和沙拉",
    fallbackResourceQuote: "家庭晚餐照常吃",
    reviewProposal: null,
  });
  const result = CoachRecommendationSchema.parse({
    interpretation: "execution_gap_possible",
    recommendation: "adjust_execution",
    summary: "午餐改用已报告的便利店选择，数值目标保持不变。",
    evidence: [
      {
        sourceId: "note",
        quote: "食堂停业。" + availabilityQuote,
        reason: "当前午餐资源",
      },
    ],
    uncertainty: "食物选择不证明实际摄入。",
    question: null,
    proposedChangeSummary:
      "午餐用豆腐配米饭与沙拉，如果豆腐缺货则改用煮鸡蛋配同样的米饭与沙拉。",
  });
  const reports = [
    { evidenceId: "current-note", quote: "食堂停业。" + availabilityQuote },
  ];
  const rejected = coachAssessmentIssues(assessment, result, reports);
  assert.ok(
    rejected.some((i) => i.startsWith("assessment.primaryResourceQuote:")),
  );
  assert.ok(
    rejected.some((i) => i.startsWith("assessment.fallbackResourceQuote:")),
  );
  assert.ok(rejected.some((i) => i.includes("proposedChanges:")));
  assert.deepEqual(
    coachAssessmentIssues(
      {
        ...assessment,
        primaryResourceQuote: "豆腐",
        fallbackResourceQuote: "煮鸡蛋",
      },
      result,
      reports,
    ),
    [],
  );
});
