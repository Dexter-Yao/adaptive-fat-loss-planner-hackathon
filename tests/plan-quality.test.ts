// ABOUTME: Synthetic unit checks for binary dimension isolation, evidence binding and evaluator failures.
// ABOUTME: Fake providers here test controls only; their labels are not human feedback or real NVIDIA inference.
import assert from "node:assert/strict";
import test from "node:test";
import {
  PLAN_DIMENSIONS,
  PLAN_QUALITY_VERSION,
} from "../src/domain/plan-quality";
import {
  evaluatePlan,
  planEvaluationInput,
  PlanJudgmentSchema,
  JudgeSubmissionSchema,
  PLAN_JUDGE_MODEL,
  PLAN_JUDGE_VERSION,
} from "../src/evaluation/plan-judge";
import {
  journeyFeasibility,
  UNMET_GOAL_NOTICE,
} from "../src/planning/journey-feasibility";
import { contentHash } from "../src/agent/stage-runtime";
import type { AgentProvider } from "../src/agent/session";
import {
  planReviewPacket,
  renderPlanReview,
} from "../src/evaluation/plan-review";
import { generationInput } from "../src/agent/stage-router";
import { journeyContentIssues } from "../src/domain/journey";
import { GeneratedJourneyContentSchema } from "../src/agent/phase-guidance";
import { journeyStageFixture, syntheticJourney } from "./support/journey-agent";

function unitReceipt() {
  const { request } = journeyStageFixture();
  return {
    caseId: "synthetic-unit-plan",
    datasetVersion: "synthetic-unit-v1",
    configurationHash: "synthetic-config",
    sourceCommit: "synthetic-unit-not-inference",
    requestHash: contentHash(request),
    requestedModel: "synthetic-generator",
    elapsedMs: 1,
    scope: "Fictional SYNTHETIC UNIT TEST ONLY; not inference evidence",
    request,
    result: {
      stage: "generate",
      binding: request.binding,
      result: syntheticJourney(generationInput(request)),
    },
    error: null,
    summaries: [
      {
        stage: "journey_generation",
        operation: "present_journey",
        status: "completed",
        elapsedMs: 1,
        submissions: 1,
        rejectedSubmissions: 0,
        usage: null,
        configuration: null,
        responses: [],
      },
    ],
    traces: [],
    traceExport: {
      runId: "00000000-0000-4000-8000-000000000001",
      status: "disabled",
      content: "fictional",
    },
  };
}
test("model-facing plan citations cannot turn behavior guidance into user evidence", () => {
  const { request } = journeyStageFixture();
  const input = generationInput(request);
  const content = syntheticJourney(input);
  const schema = GeneratedJourneyContentSchema;
  assert.equal(schema.safeParse(content).success, true);
  content.whyForYou[0].sourceId = "behavior";
  assert.ok(
    journeyContentIssues(
      content,
      input.binding,
      input.sources,
      input.preferences.availableTrainingMinutes,
    ).some((s) => /exact supplied source/.test(s)),
  );
});
test("one complete, bound initial/revised plan is the judging unit; failed or misbound artifacts cannot be scored", () => {
  const raw = unitReceipt();
  const input = planEvaluationInput(raw, "synthetic-unit-experiment");
  assert.equal(input.candidateStage, "generate");
  assert.equal("mealSchedules" in input.caseData.preferences, false);
  assert.equal("missingMealMultiplier" in input.caseData.preferences, false);
  assert.equal(input.caseData.candidate.headline, raw.result.result.headline);
  assert.throws(
    () => planEvaluationInput({ ...raw, error: "synthetic failure" }, "unit"),
    /completed/,
  );
  const mismatch = structuredClone(raw);
  mismatch.result.binding.sourceRevision++;
  assert.throws(() => planEvaluationInput(mismatch, "unit"), /binding/);
  assert.throws(
    () => planEvaluationInput({ ...raw, requestHash: "wrong" }, "unit"),
    /hash/,
  );
});
test("completed judgments contain only binary verdict and reason; missing context is a separate execution result", () => {
  const reason =
    "This is a grounded synthetic reason for the unit contract, not a quality label.";
  assert.equal(
    PlanJudgmentSchema.safeParse({ verdict: "pass", reason }).success,
    true,
  );
  assert.equal(
    PlanJudgmentSchema.safeParse({ verdict: "unsure", reason }).success,
    false,
  );
  assert.equal(
    PlanJudgmentSchema.safeParse({
      verdict: "pass",
      reason,
      evidencePaths: ["candidate.summary"],
    }).success,
    false,
  );
  assert.equal(
    PlanJudgmentSchema.safeParse({
      verdict: "pass",
      reason,
      missingEvidence: [],
    }).success,
    false,
  );
  assert.equal(
    JudgeSubmissionSchema.safeParse({
      status: "incomplete",
      verdict: null,
      reason,
    }).success,
    true,
  );
});
test("generation and judging share the exact Hall goal policy, including tolerance and unavailable composition", () => {
  const { request } = journeyStageFixture();
  const calculation = structuredClone(request.calculation!);
  const hall = calculation.models.find((m) => m.id === "hall")!;
  assert.ok(hall.endpoint);
  hall.endpoint.date = calculation.targetDate!;
  hall.endpoint.weightKg = request.goal.value + 0.1;
  assert.equal(
    journeyFeasibility(calculation, request.goal).goalReachedAtHorizon,
    true,
  );
  hall.endpoint.weightKg = request.goal.value + 0.3;
  assert.equal(
    journeyFeasibility(calculation, request.goal).goalReachedAtHorizon,
    false,
  );
  assert.equal(
    journeyFeasibility(calculation, request.goal).requiredNotice,
    UNMET_GOAL_NOTICE,
  );
  hall.status = "failed";
  assert.equal(
    journeyFeasibility(calculation, request.goal).goalReachedAtHorizon,
    null,
  );
  hall.status = "ok";
  hall.endpoint.bodyFatPct = null;
  assert.equal(
    journeyFeasibility(calculation, {
      ...request.goal,
      kind: "body_fat",
      value: 25,
    }).goalReachedAtHorizon,
    null,
  );
  hall.endpoint.date = "2026-01-01";
  assert.equal(
    journeyFeasibility(calculation, request.goal).goalReachedAtHorizon,
    null,
  );
});
test("four dimensions start in parallel with isolated answers; trace failure cannot erase a model judgment", async () => {
  const input = planEvaluationInput(unitReceipt(), "synthetic-parallel");
  const starts: string[] = [];
  let release!: () => void;
  const allStarted = new Promise<void>((resolve) => {
    release = resolve;
  });
  const provider: AgentProvider = {
    name: "nebius",
    model: PLAN_JUDGE_MODEL,
    async run(_instructions, raw, _tools, handle, _signal, observer) {
      const c = JSON.parse(raw);
      assert.equal(c.otherJudgments, undefined);
      assert.equal(c.caseData.generatorModel, undefined);
      starts.push(c.dimension.id);
      if (starts.length === 4) release();
      await allStarted;
      observer?.({
        kind: "configuration",
        value: {
          model: PLAN_JUDGE_MODEL,
          maxTokens: 8192,
          requestedThinking: true,
          temperature: 0.2,
        },
      });
      observer?.({
        kind: "usage",
        value: {
          model: PLAN_JUDGE_MODEL,
          responseId: "synthetic-unit",
          finishReason: "tool_calls",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      });
      const reply = await handle("judge_plan_dimension", {
        status: "completed",
        verdict: c.dimension.id === "science_safety" ? "fail" : "pass",
        reason:
          "Synthetic unit judgment, not a real clinical or usefulness assessment.",
      });
      assert.equal(reply.status, "ok");
    },
  };
  const r = await evaluatePlan(input, provider, {
    env: { LANGSMITH_TRACING: "true" },
    client: {
      batchIngestRuns: async () => {
        throw Error("Synthetic exporter failure");
      },
    },
  });
  assert.deepEqual(new Set(starts), new Set(PLAN_DIMENSIONS.map((d) => d.id)));
  assert.equal(r.evaluationStatus, "completed");
  assert.equal(r.planVerdict, "fail");
  assert.ok(
    r.dimensions.every(
      (d) => d.status === "completed" && d.traceExport.status === "failed",
    ),
  );
  assert.equal(r.calibrationStatus, "not_calibrated");
});
test("a failed judge is an incomplete evaluation, not a fabricated quality fail or pass", async () => {
  const input = planEvaluationInput(unitReceipt(), "synthetic-failure");
  const provider: AgentProvider = {
    name: "nebius",
    model: PLAN_JUDGE_MODEL,
    async run() {
      throw Error("Synthetic model failure");
    },
  };
  const r = await evaluatePlan(input, provider, { env: {} });
  assert.equal(r.evaluationStatus, "incomplete");
  assert.equal(r.planVerdict, null);
  assert.ok(
    r.dimensions.every((d) => d.judgment === null && d.status === "failed"),
  );
  await assert.rejects(
    evaluatePlan(input, { ...provider, model: "other-model" }),
    /no model substitution/,
  );
});

test("an unassessable dimension withholds the overall verdict even when another dimension validly fails", async () => {
  const input = planEvaluationInput(unitReceipt(), "synthetic-incomplete");
  const provider: AgentProvider = {
    name: "nebius",
    model: PLAN_JUDGE_MODEL,
    async run(_instructions, raw, _tools, handle, _signal, observer) {
      const { dimension } = JSON.parse(raw);
      assert.equal(JSON.parse(raw).caseData.feasibility.authority, "hall");
      observer?.({
        kind: "usage",
        value: {
          model: PLAN_JUDGE_MODEL,
          responseId: "synthetic-assessability",
          finishReason: "tool_calls",
          usage: { total_tokens: 1 },
        },
      });
      const incomplete = dimension.id === "agency_feedback";
      const reply = await handle("judge_plan_dimension", {
        status: incomplete ? "incomplete" : "completed",
        verdict: incomplete
          ? null
          : dimension.id === "science_safety"
            ? "fail"
            : "pass",
        reason: incomplete
          ? "The necessary prior feedback is unavailable, so this comparison cannot be validly assessed."
          : "This is an isolated synthetic contract result, not evidence of real plan quality.",
      });
      assert.equal(reply.status, "ok");
    },
  };
  const r = await evaluatePlan(input, provider, { env: {} });
  assert.equal(r.evaluationStatus, "incomplete");
  assert.equal(r.planVerdict, null);
  const incomplete = r.dimensions.find(
    (d) => d.dimensionId === "agency_feedback",
  )!;
  assert.equal(incomplete.status, "incomplete");
  assert.equal(incomplete.judgment, null);
  assert.match(incomplete.incompleteReason!, /unavailable/);
  assert.equal(incomplete.error, null);
  assert.equal(
    r.dimensions.find((d) => d.dimensionId === "science_safety")!.judgment!
      .verdict,
    "fail",
  );
});
test("the tool cannot attach a quality fail to an incomplete assessment", async () => {
  const provider: AgentProvider = {
    name: "nebius",
    model: PLAN_JUDGE_MODEL,
    async run(_instructions, _raw, _tools, handle) {
      const reply = await handle("judge_plan_dimension", {
        status: "incomplete",
        verdict: "fail",
        reason:
          "The synthetic context is missing, which is not evidence of a failed plan.",
      });
      assert.equal(reply.status, "invalid");
    },
  };
  const r = await evaluatePlan(
    planEvaluationInput(unitReceipt(), "synthetic-invalid"),
    provider,
    { env: {} },
  );
  assert.equal(r.evaluationStatus, "incomplete");
  assert.equal(r.planVerdict, null);
  assert.ok(
    r.dimensions.every((d) => d.status === "failed" && d.judgment === null),
  );
});

function syntheticReport(receipt: ReturnType<typeof unitReceipt>) {
  const input = planEvaluationInput(receipt, "synthetic-review");
  return {
    ...input,
    rubricVersion: PLAN_QUALITY_VERSION,
    judgeVersion: PLAN_JUDGE_VERSION,
    judgeConfigurationHash: "synthetic-judge-configuration",
    calibrationStatus: "not_calibrated",
    evaluationStatus: "completed",
    planVerdict: "pass",
    dimensions: PLAN_DIMENSIONS.map((d) => ({
      dimensionId: d.id,
      status: "completed",
      judgment: {
        verdict: "pass",
        reason:
          "Synthetic reader test only, never a human judgment or real inference.",
      },
      incompleteReason: null,
      error: null,
      traceExport: { status: "disabled", runId: null },
    })),
  };
}
test("the original v8 reasons remain readable under their own judge version", () => {
  const receipt = unitReceipt();
  const report = {
    ...syntheticReport(receipt),
    judgeVersion: "plan-judge-2026-10-30-coherence-v8",
  };
  const packet = planReviewPacket([receipt], [report]);
  assert.equal(packet.items[0].judge?.judgeVersion, report.judgeVersion);
  assert.equal(
    packet.items[0].judge?.dimensions[0].judgment?.reason,
    report.dimensions[0].judgment.reason,
  );
  assert.ok(renderPlanReview(packet).includes(report.judgeVersion));
});
test("the reader binds complete initial/revised content and feedback without truncation or embedded feedback controls", () => {
  const initial = unitReceipt();
  initial.result.result.headline =
    '<script>alert("synthetic-untrusted")</script>';
  initial.result.result.weeks.at(-1)!.actions[0].successCheck =
    "Synthetic final-week observation must remain visible in full.";
  const revision = structuredClone(initial);
  revision.caseId = "synthetic-unit-revision";
  revision.traceExport.runId = "00000000-0000-4000-8000-000000000002";
  revision.request.stage = "revise";
  revision.request.previousDraft = {
    id: "synthetic-prior",
    binding: generationInput(initial.request).binding,
    feedbackRevision: 0,
    content: initial.result.result,
  };
  revision.request.feedback = {
    draftId: "synthetic-prior",
    sourceRevision: revision.request.binding.sourceRevision,
    priorities: ["fewer_actions"],
    availableTrainingMinutes: 0,
    requestedGoalDate: null,
    notes:
      "Synthetic explicit feedback: make the available choice simpler without added training.",
  };
  revision.requestHash = contentHash(revision.request);
  revision.result.stage = "revise";
  revision.result.result.headline = "Synthetic revised plan";
  const reports = [syntheticReport(initial), syntheticReport(revision)];
  const packet = planReviewPacket([initial, revision], reports);
  assert.equal(
    packet.items[1].previousCandidateRunId,
    packet.items[0].candidateRunId,
  );
  const html = renderPlanReview(packet);
  assert.ok(html.includes("完整初始方案") && html.includes("完整修订方案"));
  assert.ok(html.includes(revision.request.feedback.notes));
  assert.ok(
    html.includes(initial.result.result.weeks.at(-1)!.actions[0].successCheck),
  );
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes('<details class="judgments">'));
  assert.equal((html.match(/查看完整用户条件与计算依据/g) ?? []).length, 1);
  assert.equal((html.match(/用户对原方案的明确反馈/g) ?? []).length, 1);
  const isolatedRevision = renderPlanReview(
    planReviewPacket([revision], [reports[1]]),
  );
  assert.ok(isolatedRevision.includes("查看修订前的完整方案"));
  assert.ok(isolatedRevision.includes("案例 1 · 完整修订方案（保留原始前案）"));
  assert.ok(isolatedRevision.includes("&lt;script&gt;"));
  assert.equal(/<form|<script|localStorage|fetch\(/i.test(html), false);
  const wrong = structuredClone(reports);
  wrong[1].inputHash = "stale-context";
  assert.throws(
    () => planReviewPacket([initial, revision], wrong),
    /exact plan/,
  );
  assert.throws(() => planReviewPacket([initial, initial], []), /only once/);
  const duplicateDimension = structuredClone(reports);
  duplicateDimension[0].dimensions[1] = duplicateDimension[0].dimensions[0];
  assert.throws(
    () => planReviewPacket([initial, revision], duplicateDimension),
    /each independent dimension/,
  );
});
