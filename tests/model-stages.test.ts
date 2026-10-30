// ABOUTME: Model boundaries consume A's actual projections and calculator with explicitly synthetic provider replies.
// ABOUTME: Tests cover source/binding/coverage integrity and fail-safe review; they do not claim real model quality.
import assert from "node:assert/strict";
import test from "node:test";
import { runModelStage, generationInput } from "../src/agent/stage-router";
import {
  measurementOnlyIssues,
  practicalAdviceIssues,
} from "../src/agent/copy-policy";
import { stageConstraints } from "../src/agent/stage-context";
import type { AgentProvider } from "../src/agent/session";
import type { StageTrace } from "../src/agent/stage-runtime";
import type { StageRequest } from "../src/domain/workflow";
import {
  buildStageRequest,
  newBinding,
} from "../src/application/journey-commands";
import {
  fictionalInput,
  fictionalStage,
  journeyHarness,
  FIXTURE_DATE,
} from "./support/journey-fixtures";
import {
  journeyStageFixture,
  syntheticJourney,
  syntheticGuidanceContent,
} from "./support/journey-agent";
import { addDays } from "../src/domain/facts";
import { loadSession } from "../src/application/persistence";

function reviewArguments(r: StageRequest, context: string) {
  const c = JSON.parse(context),
    answer = fictionalStage(r);
  if (answer.stage !== "review_progress") throw new Error("Wrong test stage");
  const {
    question,
    proposedChangeSummary,
    recommendation: _recommendation,
    ...fields
  } = answer.result;
  return {
    ...fields,
    assessment: {
      numerical: "continue_plan",
      practical: "no_new_obstacle",
      barrierQuote: null,
      availabilityQuote: null,
      primaryResourceQuote: null,
      fallbackResourceQuote: null,
      reviewProposal: null,
    },
    questions: question ? [question] : [],
    proposedChanges: proposedChangeSummary ? [proposedChangeSummary] : [],
    evidence: answer.result.evidence.map((e) => ({
      evidenceId:
        c.evidenceOptions.find(
          (s: { sourceId: string }) => s.sourceId === e.sourceId,
        )?.evidenceId ?? c.evidenceOptions[0].evidenceId,
    })),
  };
}

test("the actual generation port echoes bindings and correlates receipts; no full curve is reintroduced", async () => {
  const r = journeyStageFixture().request,
    traces: StageTrace[] = [];
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run(_p, context, tools, h) {
      const c = JSON.parse(context);
      assert.equal(
        c.calculator.forecastInputHash,
        r.calculation!.forecastInputHash,
      );
      assert.equal(c.calculator.models[0].current, undefined);
      assert.ok(c.calculator.milestones.length < 54);
      assert.equal(
        (
          await h(
            tools[0].name,
            syntheticGuidanceContent(syntheticJourney(generationInput(r))),
          )
        ).status,
        "ok",
      );
    },
  };
  const result = await runModelStage(r, provider, {
    onTrace: (t) => traces.push(t),
  });
  assert.deepEqual(result.binding, r.binding);
  assert.equal(traces[0].requestId, r.binding.requestId);
  assert.equal(traces[0].request, undefined, "Raw payload capture is opt-in.");
});

test("stale calculation, target, baseline, source and history projections fail before inference", async () => {
  let calls = 0;
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run() {
      calls++;
    },
  };
  const changes: ((r: StageRequest) => void)[] = [
    (r) => r.calculation!.binding.sourceRevision++,
    (r) => (r.calculation!.targetScheduleHash = "0".repeat(64)),
    (r) => (r.calculation!.baseline!.pal = 2),
    (r) => (r.sources.context = "An invented user context"),
    (r) => r.historyCoverage.includedRecords++,
  ];
  for (const change of changes) {
    const r = journeyStageFixture().request;
    change(r);
    await assert.rejects(runModelStage(r, provider));
  }
  assert.equal(calls, 0);
});

async function progressRequest(notes = "Measured under the usual conditions.") {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  const day = addDays(FIXTURE_DATE, 7);
  h.setToday(day);
  const expected =
    h.state.journey.acceptances[0].reference.modelResults[0].current.find(
      (p) => p.date === day,
    )!;
  await h.controller.updateMeasurement({
    date: day,
    weightKg: expected.weightKg,
    bodyFat: null,
    notes,
  });
  await h.controller.reviewProgress(true);
  return {
    h,
    request: h.calls.findLast((r) => r.stage === "review_progress")!,
  };
}
test("a quiet manual review can keep the plan without changing a numerical target", async () => {
  const { h, request: r } = await progressRequest(),
    before = structuredClone(h.state.targetRevisions);
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run(_p, ctx, t, handle) {
      const c = JSON.parse(ctx);
      assert.equal(
        c.checkInEvidence.futureProjectionComparison
          .weightDirectionFromReference,
        "unchanged",
      );
      for (const e of c.evidenceOptions) {
        if (e.sourceId === "forecast") assert.equal(e.quote, undefined);
        else assert.ok(r.sources[e.sourceId].includes(e.quote));
      }
      assert.equal(
        c.evidenceOptions.filter(
          (e: { sourceId: string }) => e.sourceId === "forecast",
        ).length >= 2,
        true,
      );
      const answer = reviewArguments(r, ctx);
      assert.equal((await handle(t[0].name, answer)).status, "ok");
    },
  };
  const response = await runModelStage(r, provider);
  assert.equal(response.stage, "review_progress");
  if (response.stage === "review_progress") {
    assert.equal(response.result.question, null);
    assert.equal(response.result.proposedChangeSummary, null);
  }
  assert.deepEqual(h.state.targetRevisions, before);
});

test("progress tools reject sentinel strings and map empty optional choices to canonical nulls", async () => {
  const { request } = await progressRequest();
  const provider: AgentProvider = {
    name: "nebius",
    model: "synthetic-no-inference",
    async run(_prompt, context, tools, handle) {
      const answer = reviewArguments(request, context);
      assert.equal(
        (await handle(tools[0].name, { ...answer, proposedChanges: ["None"] }))
          .status,
        "rejected",
      );
      assert.equal(
        (
          await handle(tools[0].name, {
            ...answer,
            proposedChanges: [],
            questions: [],
          })
        ).status,
        "ok",
      );
    },
  };
  const response = await runModelStage(request, provider);
  assert.ok(response.stage === "review_progress");
  assert.equal(response.result.proposedChangeSummary, null);
  assert.equal(response.result.question, null);
});

test("one repair receives missing-change and unsafe numerical-prose issues together", async () => {
  const { request } = await progressRequest(
    "The lunch counter is closed. At lunch the convenience store has ready-to-eat rice, tofu, eggs and salad.",
  );
  const provider: AgentProvider = {
    name: "nebius",
    model: "synthetic-no-inference",
    async run(_prompt, context, tools, handle) {
      const answer = reviewArguments(request, context);
      const rejected = await handle(tools[0].name, {
        ...answer,
        assessment: {
          numerical: "continue_plan",
          practical: "workaround",
          barrierQuote: "The lunch counter is closed.",
          availabilityQuote:
            "At lunch the convenience store has ready-to-eat rice, tofu, eggs and salad.",
          primaryResourceQuote: "tofu",
          fallbackResourceQuote: "eggs",
          reviewProposal: null,
        },
        summary: "Eat 1800 kcal to fix this.",
        proposedChanges: [],
      });
      assert.equal(rejected.status, "rejected");
      assert.match(JSON.stringify(rejected), /concrete change summary/);
      assert.match(JSON.stringify(rejected), /Numerical/);
      assert.equal((await handle(tools[0].name, answer)).status, "ok");
    },
  };
  await runModelStage(request, provider);
});
test("note-only scope review works without a fresh numeric calculation and rejects loss advice", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  await h.controller.updateMeasurement({
    date: FIXTURE_DATE,
    weightKg: null,
    bodyFat: null,
    notes: "I have chest pain and severe dizziness.",
  });
  const r = h.calls.findLast((r) => r.stage === "review_progress")!;
  assert.equal(r.calculation, null);
  assert.equal(stageConstraints(r).applicability, "needs_confirmation");
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run(_p, ctx, t, handle) {
      const source = JSON.parse(ctx).evidenceOptions.find(
        (e: { sourceId: string }) => e.sourceId === `log:${FIXTURE_DATE}`,
      );
      const result = {
        interpretation: "scope_concern",
        assessment: {
          numerical: "withhold",
          practical: "withhold",
          barrierQuote: null,
          availabilityQuote: null,
          primaryResourceQuote: null,
          fallbackResourceQuote: null,
          reviewProposal: null,
        },
        summary: "Review the new information.",
        evidence: [
          {
            evidenceId: source.evidenceId,
          },
        ],
        uncertainty: "The application cannot determine the cause.",
        questions: [],
        proposedChanges: ["Continue the calorie deficit."],
      };
      assert.equal((await handle(t[0].name, result)).status, "rejected");
      result.proposedChanges = [
        "Pause loss guidance and seek appropriate assessment before resuming.",
      ];
      assert.equal((await handle(t[0].name, result)).status, "ok");
    },
  };
  const answer = await runModelStage(r, provider);
  assert.equal(
    answer.stage === "review_progress" && answer.result.recommendation,
    "pause",
  );
});
test("a failed real stage port leaves the check-in saved and the accepted journey intact", async () => {
  const base = await progressRequest(),
    targets = structuredClone(base.h.state.targetRevisions);
  let unavailable = true;
  const h = journeyHarness({
    stage: (r) =>
      runModelStage(r, {
        name: "codex",
        model: "synthetic",
        async run(_p, c, t, handle) {
          if (unavailable) throw new Error("Synthetic provider unavailable");
          assert.equal(
            (await handle(t[0].name, reviewArguments(r, c))).status,
            "ok",
          );
        },
      }),
  });
  h.replace(base.h.state);
  const date = addDays(FIXTURE_DATE, 8);
  h.setToday(date);
  const projected = h.state.snapshot!.forecast!.modelResults[0].current.find(
    (p) => p.date === date,
  )!.weightKg;
  await assert.rejects(
    h.controller.updateMeasurement({
      date,
      weightKg: projected + 0.3,
      bodyFat: null,
      notes: "Weighed at an unusual time.",
    }),
    /Synthetic provider unavailable/,
  );
  assert.equal(h.state.logs.at(-1)!.date, date);
  assert.deepEqual(h.state.targetRevisions, targets);
  assert.deepEqual(loadSession(h.storage).session, h.state);
  assert.equal(h.state.journey.task?.status, "failed");
  unavailable = false;
  await h.controller.retry();
  assert.equal(h.state.journey.task, null);
  assert.deepEqual(h.state.targetRevisions, targets);
});
test("the deferred diary guard rejects a request to collect meals during progress coaching", async () => {
  const { request: r } = await progressRequest();
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run(_p, c, t, h) {
      const answer = reviewArguments(r, c);
      answer.questions = ["Can you track food each day?"];
      const reply = await h(t[0].name, answer);
      assert.equal(reply.status, "rejected");
      assert.match(JSON.stringify(reply), /logging is deferred/);
    },
  };
  await assert.rejects(runModelStage(r, provider), /validated stage result/);
});

test("the diary boundary distinguishes not logging from a positive request, including contrasts", () => {
  const captured =
    "Your weekday lunches come from the canteen or takeaway and you prefer not to weigh, photograph or log food, nor spend weekends meal-prepping.";
  assert.deepEqual(measurementOnlyIssues(captured), []);
  assert.deepEqual(
    measurementOnlyIssues(
      "Keep the routine without recording meals or counting calories.",
    ),
    [],
  );
  assert.deepEqual(measurementOnlyIssues("You don't need to log food."), []);
  assert.deepEqual(
    measurementOnlyIssues(
      "Your desk job and shared family meals shape when and what you eat, and you prefer simple weekly principles over weighing or meal‑prepping.",
    ),
    [],
  );
  assert.deepEqual(
    measurementOnlyIssues("You prefer weekly principles over weighing food."),
    [],
  );
  assert.ok(measurementOnlyIssues("Weigh food portions before dinner.").length);
  assert.deepEqual(
    measurementOnlyIssues(
      "Family dinners are shared; no weighing, photographing, or calorie recording.",
    ),
    [],
  );
  assert.ok(measurementOnlyIssues("No kitchen, so log food daily.").length);
  assert.deepEqual(
    measurementOnlyIssues("Track your weight without recording food."),
    [],
  );
  for (const advice of [
    "Start logging food daily.",
    "Track each meal.",
    "You do not need to log food, but record your calories every day.",
    "Avoid logging food; record exercise instead.",
    "Do not log food and should track workouts.",
  ])
    assert.ok(measurementOnlyIssues(advice).length, advice);
});
test("persistent hunger cannot become a reason to prescribe further restriction", () => {
  assert.ok(
    practicalAdviceIssues(
      "If hunger persists, slightly reduce the rice/noodle portion while keeping vegetables and protein.",
    ).length,
  );
  assert.ok(
    practicalAdviceIssues("For persistent hunger, skip a meal.").length,
  );
  assert.deepEqual(
    practicalAdviceIssues(
      "If hunger persists, do not reduce portions; review the plan's fit.",
    ),
    [],
  );
  assert.deepEqual(
    practicalAdviceIssues(
      "Review persistent hunger, satisfaction and the plan's assumptions.",
    ),
    [],
  );
});
