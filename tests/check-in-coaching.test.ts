// ABOUTME: Focused coach-tool, dated evidence and guidance freshness regressions with explicit synthetic providers.
// ABOUTME: Real calculator/storage owners are exercised; no synthetic response is a human or clinical quality label.
import assert from "node:assert/strict";
import test from "node:test";
import { runModelStage } from "../src/agent/stage-router";
import {
  checkInReasoning,
  coachAssessmentIssues,
} from "../src/agent/check-in-reasoning";
import { checkInCopyIssues } from "../src/agent/check-in-copy";
import { reviewSuite } from "../src/evaluation/review-suite";
import type { AgentProvider } from "../src/agent/session";
import type { StageRequest } from "../src/domain/workflow";
import { adviceContextKey } from "../src/application/advice-context";
import { selectJourney } from "../src/application/journey-selectors";
import { adviceUsable } from "../src/application/selectors";
import { selectCheckInExperience } from "../src/application/journey-experience-view";
import { loadSession } from "../src/application/persistence";
import { addDays } from "../src/domain/facts";
import {
  journeyHarness,
  fictionalInput,
  fictionalStage,
  FIXTURE_DATE,
} from "./support/journey-fixtures";

async function accepted() {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  return h;
}

for (const note of [
  "Fictional check-in: this is my actual morning reading on the same scale. Overtime is now taking four evenings a week. Going forward I am willing to give only thirty minutes a week to formal activity. Help me simplify the plan while keeping family dinners, without stricter food rules or additional logging.",
  "Family caregiving now takes my evenings. For future formal activity I can offer only twenty minutes per week. Please review a simpler plan; keep familiar meals and do not add tracking.",
]) {
  test(`a stated lower future activity capacity uses plan review without food resources: ${note.slice(0, 30)}`, async () => {
    const input = structuredClone(
      reviewSuite.cases.find((c) => c.id === "J03")!.initialInput,
    );
    const h = journeyHarness();
    h.setToday(input.profile.startDate);
    await h.controller.start(input, true);
    await h.controller.accept();
    const targets = structuredClone(h.state.targetRevisions);
    const acceptances = structuredClone(h.state.journey.acceptances);
    const weeks = structuredClone(h.state.weeklyPlans);
    const preferences = structuredClone(h.state.preferences);
    const activity = structuredClone(h.state.profile.activity);
    const reviewProposal =
      "Review the accepted future activity assumption against the lower availability you just reported, then prepare a simpler replacement for your review and explicit acceptance. Keep the current targets, familiar meals and accepted plan unchanged until acceptance; add no food rules or logging.";
    const provider: AgentProvider = {
      name: "codex",
      model: "synthetic-capacity-review",
      async run(_prompt, text, tools, handle) {
        const c = JSON.parse(text);
        assert.deepEqual(
          c.practicalContext.acceptedActivityAssumptions.baselineRoutines,
          activity.routines,
        );
        assert.equal(
          c.practicalContext.acceptedActivityAssumptions
            .savedWeeklyTrainingMinutes,
          60,
        );
        assert.equal(c.practicalContext.latestReport.notes, note);
        const report = c.evidenceOptions.find(
          (e: { sourceId: string }) =>
            e.sourceId === `log:${input.profile.startDate}`,
        );
        assert.equal(
          (
            await handle(tools[0].name, {
              interpretation: "assumptions_changed",
              assessment: {
                numerical: "review_projection",
                practical: "no_new_obstacle",
                barrierQuote: null,
                availabilityQuote: null,
                primaryResourceQuote: null,
                fallbackResourceQuote: null,
                reviewProposal,
              },
              summary:
                "Your newly stated future activity availability differs from the accepted routine. Review a simpler replacement before changing the accepted plan.",
              uncertainty:
                "Future willingness does not establish completed activity or its effect on the conditional forecast.",
              evidence: [{ evidenceId: report.evidenceId }],
              questions: [],
              proposedChanges: [],
            })
          ).status,
          "ok",
        );
      },
    };
    h.ports.stage = (r) => runModelStage(r, provider);
    await h.controller.updateMeasurement({
      date: input.profile.startDate,
      weightKg: 81.7,
      bodyFat: null,
      notes: note,
    });
    await h.controller.reviewProgress(true);
    const result = h.state.journey.reviews.at(-1)?.result;
    assert.ok(result);
    assert.equal(result.recommendation, "revise_plan");
    assert.equal(result.question, null);
    assert.equal(result.proposedChangeSummary, reviewProposal);
    assert.ok(result.evidence.some((e) => e.quote === note));
    assert.deepEqual(h.state.targetRevisions, targets);
    assert.deepEqual(h.state.journey.acceptances, acceptances);
    assert.deepEqual(h.state.weeklyPlans, weeks);
    assert.deepEqual(h.state.preferences, preferences);
    assert.deepEqual(h.state.profile.activity, activity);
    assert.deepEqual(loadSession(h.storage).session, h.state);
  });
}

for (const recommendation of [
  "keep_plan",
  "remeasure",
  "adjust_execution",
] as const) {
  test(`${recommendation} with exact evidence cannot mark the stored plan adapted to a new access note`, async () => {
    const h = await accepted();
    const reviewed = h.state.agentReviewedContextKey;
    const targets = structuredClone(h.state.targetRevisions);
    const weeks = structuredClone(h.state.weeklyPlans);
    await h.controller.updateMeasurement({
      date: FIXTURE_DATE,
      weightKg: null,
      bodyFat: null,
      notes:
        "The canteen has closed. Lunch is available from the nearby convenience store, with ready-to-eat rice, tofu and eggs.",
    });
    assert.equal(
      h.calls.filter((r) => r.stage === "review_progress").length,
      0,
    );
    h.ports.stage = async (r) => {
      const response = fictionalStage(r);
      assert.equal(response.stage, "review_progress");
      if (response.stage !== "review_progress") throw Error("Expected review");
      return {
        ...response,
        result: {
          ...response.result,
          recommendation,
          proposedChangeSummary:
            recommendation === "adjust_execution"
              ? "At lunch, use the open convenience store's tofu and rice, or eggs and rice if tofu is out. Keep targets unchanged."
              : null,
          evidence: [
            {
              sourceId: `log:${FIXTURE_DATE}`,
              quote: r.sources[`log:${FIXTURE_DATE}`],
              reason: "Your reported access changed.",
            },
          ],
        },
      };
    };
    await h.controller.reviewProgress(true);
    assert.equal(h.state.agentReviewedContextKey, reviewed);
    assert.notEqual(reviewed, adviceContextKey(h.state));
    const view = selectCheckInExperience(h.state, FIXTURE_DATE);
    assert.equal(view.review?.current, true);
    assert.equal(view.numbersFresh, true);
    assert.equal(view.guidanceFresh, false);
    assert.deepEqual(h.state.targetRevisions, targets);
    assert.deepEqual(h.state.weeklyPlans, weeks);
    assert.deepEqual(loadSession(h.storage).session, h.state);
    if (recommendation !== "adjust_execution") {
      // Reproduce the exact old promotion on an already-saved Session v6.
      h.replace({
        ...h.state,
        agentReviewedContextKey: adviceContextKey(h.state),
      });
      const reopened = loadSession(h.storage).session!;
      assert.equal(
        selectCheckInExperience(reopened, FIXTURE_DATE).guidanceFresh,
        false,
      );
      assert.equal(adviceUsable(reopened, FIXTURE_DATE), false);
    }
  });
}

test("numeric-only quiet updates retain guidance freshness without another model call", async () => {
  const h = await accepted();
  const date = addDays(FIXTURE_DATE, 7);
  const weight = h.state.snapshot!.forecast!.modelResults[0].current.find(
    (p) => p.date === date,
  )!.weightKg;
  const key = h.state.agentReviewedContextKey;
  h.setToday(date);
  await h.controller.updateMeasurement({
    date,
    weightKg: weight,
    bodyFat: null,
    notes: "",
  });
  assert.equal(h.calls.filter((r) => r.stage === "review_progress").length, 0);
  assert.equal(h.state.agentReviewedContextKey, key);
  assert.equal(selectCheckInExperience(h.state, date).guidanceFresh, true);
});

test("review currency includes the session, action revision and day, not just matching numerical facts", async () => {
  const h = await accepted();
  await h.controller.reviewProgress(true);
  assert.equal(selectJourney(h.state, FIXTURE_DATE).coach?.current, true);
  assert.equal(
    selectJourney(h.state, addDays(FIXTURE_DATE, 1)).coach?.current,
    false,
  );
  assert.equal(
    selectJourney(
      { ...h.state, actionsRevision: h.state.actionsRevision + 1 },
      FIXTURE_DATE,
    ).coach?.current,
    false,
  );
  assert.equal(
    selectJourney({ ...h.state, id: "another-session" }, FIXTURE_DATE).coach
      ?.current,
    false,
  );
});

test("new input retains prior review as a suggestion, not a completed action", async () => {
  const h = await accepted();
  await h.controller.reviewProgress(true);
  const prior = h.state.journey.reviews.at(-1)!.result;
  h.controller.dismissReview();
  await h.controller.updateMeasurement({
    date: FIXTURE_DATE,
    weightKg: null,
    bodyFat: null,
    notes: "That suggested shop is also closed now.",
  });
  let request: StageRequest | undefined;
  h.ports.stage = async (r) => {
    request = r;
    return fictionalStage(r);
  };
  await h.controller.reviewProgress(true);
  assert.deepEqual(request!.latestReview, prior);
});

async function numericalRequest() {
  const h = await accepted();
  const date = addDays(FIXTURE_DATE, 7);
  h.setToday(date);
  const predicted = h.state.snapshot!.forecast!.modelResults[0].current.find(
    (p) => p.date === date,
  )!.weightKg;
  await h.controller.updateMeasurement({
    date,
    weightKg: predicted + 0.1,
    bodyFat: null,
    notes: "",
  });
  let request: StageRequest | undefined;
  h.ports.stage = async (r) => {
    request = r;
    return fictionalStage(r);
  };
  await h.controller.reviewProgress(true);
  return request!;
}

test("actual reports, same-day pre-update residuals and future forecast deltas retain separate dates and meanings", async () => {
  const r = await numericalRequest();
  const reasoning = checkInReasoning(r, r.sources);
  assert.equal(reasoning.reportedMeasurements[0].date, r.binding.asOfDate);
  assert.equal(
    reasoning.sameDayObservationResiduals!.weight[0].date,
    r.binding.asOfDate,
  );
  assert.ok(
    Math.abs(
      reasoning.sameDayObservationResiduals!.weight[0].residualKg - 0.1,
    ) < 1e-8,
  );
  assert.ok(reasoning.futureProjectionComparison!.date > r.binding.asOfDate);
  const old = JSON.parse(r.sources.forecast);
  delete old.observations;
  assert.equal(
    checkInReasoning(r, { ...r.sources, forecast: JSON.stringify(old) })
      .sameDayObservationResiduals,
    null,
  );
  for (const change of ["hash", "date", "actual", "residual"]) {
    const wrong = JSON.parse(r.sources.forecast);
    if (change === "hash") wrong.observations.inputHash = "0".repeat(64);
    if (change === "date")
      wrong.observations.weight[0].date = addDays(r.binding.asOfDate, 1);
    if (change === "actual") wrong.observations.weight[0].actualKg += 1;
    if (change === "residual") wrong.observations.weight[0].residualKg += 1;
    assert.throws(
      () =>
        checkInReasoning(r, { ...r.sources, forecast: JSON.stringify(wrong) }),
      /residual/,
    );
  }
});

test("the coach tool separately judges targets and obstacles, rejects an inconsistent change and saves only the frozen DTO", async () => {
  const h = await accepted();
  await h.controller.updateMeasurement({
    date: FIXTURE_DATE,
    weightKg: null,
    bodyFat: null,
    notes:
      "The canteen is closed. The convenience store at lunch has ready-to-eat rice, tofu, eggs and salad.",
  });
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic-check-in",
    async run(_p, text, tools, handle) {
      const c = JSON.parse(text);
      const report = c.evidenceOptions.find(
        (e: { sourceId: string }) => e.sourceId === `log:${FIXTURE_DATE}`,
      );
      assert.ok(c.currentGuidance.length);
      assert.equal(
        c.checkInEvidence.futureProjectionComparison.kind,
        "common_date_future_projection",
      );
      const value = {
        interpretation: "execution_gap_possible",
        assessment: {
          numerical: "continue_plan",
          practical: "workaround",
          barrierQuote: "The canteen is closed.",
          availabilityQuote:
            "The convenience store at lunch has ready-to-eat rice, tofu, eggs and salad.",
          primaryResourceQuote: "tofu",
          fallbackResourceQuote: "eggs",
          reviewProposal: null,
        },
        summary:
          "Keep your numerical targets and work around the closed canteen.",
        uncertainty:
          "The note reports access, not actual intake. The forecast still assumes accepted numerical targets and baseline activity.",
        evidence: [
          {
            evidenceId: c.evidenceOptions.find(
              (e: { sourceId: string }) => e.sourceId === "preferences",
            ).evidenceId,
          },
        ],
        questions: [],
        proposedChanges: [
          "At lunch, choose tofu, rice and salad from the open convenience store; if tofu is out, choose its eggs with rice and salad. Numerical targets stay unchanged.",
        ],
      };
      const rejected = await handle(tools[0].name, {
        ...value,
        assessment: {
          ...value.assessment,
          practical: "no_new_obstacle",
          barrierQuote: null,
          availabilityQuote: null,
          primaryResourceQuote: null,
          fallbackResourceQuote: null,
          reviewProposal: null,
        },
      });
      assert.equal(rejected.status, "rejected");
      assert.match(JSON.stringify(rejected), /proposed change|quiet update/i);
      assert.equal((await handle(tools[0].name, value)).status, "ok");
    },
  };
  h.ports.stage = (r) => runModelStage(r, provider);
  await h.controller.reviewProgress(true);
  const result = h.state.journey.reviews.at(-1)!.result;
  assert.equal(result.recommendation, "adjust_execution");
  assert.equal("assessment" in result, false);
  assert.equal(result.evidence[0].quote, h.state.logs[0].notes);
  assert.equal(
    selectCheckInExperience(h.state, FIXTURE_DATE).guidanceFresh,
    false,
  );
});

test("unknown access gets one question instead of a fabricated proposal", async () => {
  const r = await numericalRequest();
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic-check-in",
    async run(_p, text, tools, handle) {
      const c = JSON.parse(text);
      const report = c.evidenceOptions.find(
        (e: { sourceId: string }) => e.sourceId === "context",
      );
      const value = {
        interpretation: "insufficient_evidence",
        assessment: {
          numerical: "continue_plan",
          practical: "needs_information",
          barrierQuote: report.quote.slice(0, 240),
          availabilityQuote: null,
          primaryResourceQuote: null,
          fallbackResourceQuote: null,
          reviewProposal: null,
        },
        summary: "Keep numerical targets while checking lunch access.",
        uncertainty: "Current lunch availability is unknown.",
        evidence: [{ evidenceId: report.evidenceId }],
        questions: ["What ready-to-eat lunch can you actually obtain at work?"],
        proposedChanges: [],
      };
      assert.equal(
        (await handle(tools[0].name, { ...value, questions: ["？"] })).status,
        "rejected",
      );
      assert.equal((await handle(tools[0].name, value)).status, "ok");
    },
  };
  const result = await runModelStage(r, provider);
  assert.equal(result.stage, "review_progress");
  if (result.stage === "review_progress") {
    assert.ok(result.result.question);
    assert.equal(result.result.proposedChangeSummary, null);
  }
});

test("an available stock quotation cannot justify an unreported fallback food", async () => {
  const response = fictionalStage(await numericalRequest());
  assert.equal(response.stage, "review_progress");
  if (response.stage !== "review_progress") throw Error("Expected coach");
  const stock =
    "At lunch the open store has ready-to-eat tofu, eggs, rice and salad.";
  const issues = coachAssessmentIssues(
    {
      numerical: "continue_plan",
      practical: "workaround",
      barrierQuote: "The canteen is closed.",
      availabilityQuote: stock,
      primaryResourceQuote: "tofu",
      fallbackResourceQuote: "chicken",
      reviewProposal: null,
    },
    {
      ...response.result,
      recommendation: "adjust_execution",
      interpretation: "execution_gap_possible",
      proposedChangeSummary:
        "At lunch choose tofu, rice and salad from the open store; if tofu is out choose chicken with the same sides.",
    },
    [{ evidenceId: "e1", quote: `The canteen is closed. ${stock}` }],
  );
  assert.match(issues.join("\n"), /fallbackResourceQuote/);
});

test("scope-only review with a retained forecast still withholds advice without requiring numerical residuals", async () => {
  const h = await accepted();
  await h.controller.updateMeasurement({
    date: FIXTURE_DATE,
    weightKg: null,
    bodyFat: null,
    notes: "I have chest pain and severe dizziness.",
  });
  const r = h.calls.findLast((r) => r.stage === "review_progress")!;
  assert.equal(r.calculation, null);
  assert.equal(
    checkInReasoning(r, r.sources).sameDayObservationResiduals,
    null,
  );
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic-scope",
    async run(_p, text, tools, handle) {
      const c = JSON.parse(text);
      const report = c.evidenceOptions.find(
        (e: { sourceId: string }) => e.sourceId === `log:${FIXTURE_DATE}`,
      );
      const value = {
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
        summary:
          "Pause loss guidance and seek appropriate assessment before resuming.",
        uncertainty: "The application cannot determine the cause.",
        evidence: [{ evidenceId: report.evidenceId }],
        questions: [],
        proposedChanges: [
          "Pause loss guidance and seek appropriate assessment before resuming.",
        ],
      };
      assert.equal((await handle(tools[0].name, value)).status, "ok");
    },
  };
  const response = await runModelStage(r, provider);
  assert.ok(
    response.stage === "review_progress" &&
      response.result.recommendation === "pause",
  );
});

test("observed undated prediction and normal-noise claims are rejected; Chinese notes receive Chinese prose", async () => {
  const r = await numericalRequest();
  const reasoning = checkInReasoning(r, r.sources);
  assert.ok(
    checkInCopyIssues(
      [{ path: "summary", text: "Weight is slightly below prediction." }],
      r,
      reasoning,
    ).length,
  );
  assert.ok(
    checkInCopyIssues(
      [{ path: "uncertainty", text: "This is within normal variation." }],
      r,
      reasoning,
    ).length,
  );
  assert.ok(
    checkInCopyIssues(
      [
        {
          path: "uncertainty",
          text: "This is a model assumption difference, not a measured cause.",
        },
      ],
      r,
      reasoning,
    ).length,
  );
  assert.ok(
    checkInCopyIssues(
      [{ path: "uncertainty", text: "The body-fat method is unchanged." }],
      r,
      reasoning,
    ).length,
  );
  assert.ok(
    checkInCopyIssues(
      [
        { path: "uncertainty", text: "Measurement conditions are unchanged." },
        { path: "question", text: "Were measurement conditions the same?" },
      ],
      r,
      reasoning,
    ).length,
  );
  assert.deepEqual(
    checkInCopyIssues(
      [
        {
          path: "summary",
          text: `The same-day pre-update residual on ${r.binding.asOfDate} is higher than predicted.`,
        },
      ],
      r,
      reasoning,
    ),
    [],
  );
  for (const text of [
    `The single weight reading on ${r.binding.asOfDate} was higher than the Hall prediction before that day's update, but this is a same-day residual, not a future forecast change.`,
    "The latest weight reading is higher than the prior Hall prediction on the same day, but this is a single-day residual, not a future endpoint change.",
  ]) {
    assert.deepEqual(
      checkInCopyIssues([{ path: "summary", text }], r, reasoning),
      [],
    );
  }
  assert.ok(
    checkInCopyIssues(
      [
        {
          path: "uncertainty",
          text: "The weight reading was affected by different clothing and a different scale.",
        },
      ],
      r,
      reasoning,
    ).length,
  );
  assert.deepEqual(
    checkInCopyIssues(
      [
        {
          path: "summary",
          text: `The future weight outlook at ${r.comparison!.date} is higher than the reference model forecast.`,
        },
      ],
      r,
      reasoning,
    ),
    [],
  );
  assert.ok(
    checkInCopyIssues(
      [
        {
          path: "summary",
          text: `The future weight outlook at ${r.comparison!.date} is lower than the reference model forecast.`,
        },
      ],
      r,
      reasoning,
    ).length,
  );
  assert.ok(
    checkInCopyIssues(
      [
        {
          path: "summary",
          text: `The same-day pre-update weight residual on ${r.binding.asOfDate} is lower than predicted.`,
        },
      ],
      r,
      reasoning,
    ).length,
  );
  r.measurements.at(-1)!.notes =
    "公司食堂关闭，午餐只能在附近便利店买现成食物，别要求额外备餐。";
  assert.ok(
    checkInCopyIssues(
      [
        {
          path: "summary",
          text: "Use ready-to-eat tofu at the convenience store.",
        },
      ],
      r,
      reasoning,
    ).length,
  );
  assert.deepEqual(
    checkInCopyIssues(
      [{ path: "summary", text: "先保持数值目标，午餐用你能买到的现成选项。" }],
      r,
      reasoning,
    ),
    [],
  );
});

test("existing material review reasons plus repeated reports require checking comparability or discussing revision, without changing triggers or targets", async () => {
  const h = await accepted();
  const targets = structuredClone(h.state.targetRevisions);
  for (const offset of [7, 14]) {
    const date = addDays(FIXTURE_DATE, offset);
    h.setToday(date);
    await h.controller.updateMeasurement({
      date,
      weightKg: h.state.profile.weightKg + 2,
      bodyFat: null,
      notes: "",
    });
  }
  await h.controller.reviewProgress(true);
  const r = h.calls.findLast((r) => r.stage === "review_progress")!;
  assert.equal(r.comparison!.evidence, "repeated_check_ins");
  assert.ok(r.comparison!.reasons.includes("weight_projection_changed"));
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic-repeated-review",
    async run(_p, text, tools, handle) {
      const c = JSON.parse(text);
      assert.equal(
        "weightKg" in c.checkInEvidence.reportedMeasurements[0],
        false,
      );
      assert.equal(
        "changesFromReference" in c.checkInEvidence.futureProjectionComparison,
        false,
      );
      type Branch = {
        properties: { numerical: { enum?: string[]; const?: string } };
      };
      const schema = tools[0].inputSchema as {
        properties: { assessment: { oneOf?: Branch[]; anyOf?: Branch[] } };
      };
      const numericalChoices = (
        schema.properties.assessment.oneOf ??
        schema.properties.assessment.anyOf ??
        []
      ).flatMap(
        (b) => b.properties.numerical.enum ?? [b.properties.numerical.const!],
      );
      assert.ok(numericalChoices.includes("confirm_measurement"));
      assert.ok(numericalChoices.includes("review_projection"));
      assert.equal(numericalChoices.includes("continue_plan"), false);
      assert.equal(numericalChoices.includes("withhold"), false);
      const value = {
        interpretation: "insufficient_evidence",
        assessment: {
          numerical: "continue_plan",
          practical: "no_new_obstacle",
          barrierQuote: null,
          availabilityQuote: null,
          primaryResourceQuote: null,
          fallbackResourceQuote: null,
          reviewProposal: null,
        },
        summary:
          "Check comparability of the repeated measurements before reviewing the plan's timing.",
        uncertainty:
          "Repeated reports do not establish actual intake, activity or cause.",
        evidence: [{ evidenceId: c.evidenceOptions[0].evidenceId }],
        questions: [
          "Were these readings taken with the same scale and timing?",
        ],
        proposedChanges: [],
      };
      assert.equal((await handle(tools[0].name, value)).status, "rejected");
      assert.equal(
        (
          await handle(tools[0].name, {
            ...value,
            assessment: {
              ...value.assessment,
              numerical: "confirm_measurement",
            },
          })
        ).status,
        "ok",
      );
    },
  };
  const response = await runModelStage(r, provider);
  assert.ok(response.stage === "review_progress");
  assert.equal(response.result.recommendation, "remeasure");
  assert.ok(
    response.result.evidence.some((e) => e.quote.startsWith('"reference":')),
  );
  assert.ok(
    response.result.evidence.some((e) => e.quote.startsWith('"updated":')),
  );
  assert.deepEqual(h.state.targetRevisions, targets);
});
