// ABOUTME: Replay real failure wording alongside counterexamples for date/type grounding and invented weigh-in routines.
// ABOUTME: Synthetic calculator cases verify boundaries; these assertions do not supply human content approval.
import assert from "node:assert/strict";
import test from "node:test";
import { checkInComparisonIssues } from "../src/agent/check-in-comparison";
import { checkInCopyIssues } from "../src/agent/check-in-copy";
import { checkInReasoning } from "../src/agent/check-in-reasoning";
import { runModelStage } from "../src/agent/stage-router";
import { addDays } from "../src/domain/facts";
import {
  journeyHarness,
  fictionalInput,
  FIXTURE_DATE,
} from "./support/journey-fixtures";

async function repeated() {
  const h = journeyHarness(),
    input = fictionalInput();
  input.goal.requestedDate = addDays(FIXTURE_DATE, 112);
  await h.controller.start(input, true);
  await h.controller.accept();
  for (const offset of [7, 14, 21]) {
    const date = addDays(FIXTURE_DATE, offset);
    h.setToday(date);
    const predicted = h.state.snapshot!.forecast!.modelResults[0].current.find(
      (p) => p.date === date,
    )!.weightKg;
    await h.controller.updateMeasurement({
      date,
      weightKg: predicted + 1,
      bodyFat: null,
      notes:
        "Busy week. Please do not add more tracking work because of this reading.",
    });
  }
  await h.controller.reviewProgress(true);
  const request = h.calls.findLast((r) => r.stage === "review_progress")!;
  assert.equal(request.comparison!.evidence, "repeated_check_ins");
  assert.ok(request.comparison!.reasons.includes("weight_projection_changed"));
  const evidence = checkInReasoning(request, request.sources);
  assert.ok(
    evidence.sameDayObservationResiduals!.weight.every((p) => p.residualKg > 0),
  );
  return { request, evidence };
}
const reportedComparison =
  "Weight readings on 2026-06-08, 2026-06-15 and 2026-06-22 were each higher than the prior Hall prediction on their respective dates, but the calculator flags a conditional projection change on 2026-09-21 rather than a measured cause.";
const reportedUncertainty =
  "Whether the three consecutive higher-than-predicted readings reflect a sustained shift or temporary variation under the same Monday-morning weighing routine.";

test("the real grouped comparison and equivalent English/Chinese expressions bind every observation without a mandatory phrase", async () => {
  const { evidence } = await repeated();
  assert.deepEqual(
    checkInComparisonIssues(
      [
        { path: "summary", text: reportedComparison },
        { path: "uncertainty", text: reportedUncertainty },
      ],
      evidence,
    ),
    [],
  );
  for (const text of [
    "The readings on 2026-06-08, 2026-06-15 and 2026-06-22 were above their earlier Hall predictions.",
    "2026-06-08、2026-06-15、2026-06-22 的体重读数都高于当时的 Hall 预测。",
    "The latest weight reading is above the previous Hall prediction on the same date.",
    "The readings on 8, 15 and 22 June were above their earlier Hall predictions.",
    "6月8日、6月15日、6月22日的读数都高于当时的预测。",
    "The future weight outlook for 2026-09-21 is higher than the prior Hall projection.",
    "The same-day pre-update residual on 2026-06-22 is above the prior prediction; the future weight outlook for 2026-09-21 is higher than the reference model forecast.",
  ])
    assert.deepEqual(
      checkInComparisonIssues([{ path: "summary", text }], evidence),
      [],
      text,
    );
  assert.deepEqual(
    checkInComparisonIssues(
      [
        {
          path: "summary",
          text: "Weight readings on three Monday mornings have been higher than the prior Hall prediction each time, and the calculator flags a change in the conditional projection for the goal date.",
        },
        {
          path: "question",
          text: "Were the Monday morning weights on 8, 15 and 22 June taken under the same conditions?",
        },
      ],
      evidence,
    ),
    [],
  );
});

test("date, type, measure and EACH direction remain mandatory, including mixed-sign grouped readings", async () => {
  const { evidence } = await repeated();
  for (const text of [
    "The reading on 2026-09-21 was above the prior Hall prediction.",
    "The future weight outlook for 2026-06-22 is higher than the reference model forecast.",
    "The actual weight reading on 2026-06-22 is higher than the future projection for 2026-09-21.",
    "The reading on 2026-06-22 is higher than the fitted same-day prediction after updating.",
    "2026-06-22 的读数高于同日纳入后的拟合预测。",
    "The readings on 2026-06-08, 2026-06-15 and 2026-06-23 were above the prior Hall prediction.",
    "The body-fat reading on 2026-06-22 is above the prior Hall prediction.",
    "The latest weight reading is below the prior Hall prediction.",
    "The future weight outlook for 2026-09-21 is lower than the reference model forecast.",
    "The three higher-than-predicted readings do not establish a cause.",
    "The readings on 8, 15 and 23 June were above their prior Hall predictions.",
    "Weight readings on two Monday mornings have been higher than the prior Hall prediction each time.",
    "Weight readings on three Tuesday mornings have been higher than the prior Hall prediction each time.",
    "The reading on 2026-06-22 was not higher than the prior Hall prediction.",
  ])
    assert.ok(
      checkInComparisonIssues([{ path: "summary", text }], evidence).length,
      text,
    );
  const mixed = structuredClone(evidence);
  mixed.sameDayObservationResiduals!.weight[1].predictedKg =
    mixed.sameDayObservationResiduals!.weight[1].actualKg + 0.1;
  mixed.sameDayObservationResiduals!.weight[1].residualKg = -0.1;
  assert.ok(
    checkInComparisonIssues(
      [{ path: "summary", text: reportedComparison }],
      mixed,
    ).length,
  );
  const absent = { ...evidence, sameDayObservationResiduals: null };
  assert.ok(
    checkInComparisonIssues(
      [{ path: "summary", text: reportedComparison }],
      absent,
    ).length,
  );
});

test("a future and an observed comparison can legitimately have opposite directions without borrowing dates", async () => {
  const { evidence } = await repeated(),
    opposite = structuredClone(evidence);
  opposite.futureProjectionComparison!.changesFromReference.weightKg = -0.2;
  assert.deepEqual(
    checkInComparisonIssues(
      [
        {
          path: "summary",
          text: "The reading on 2026-06-22 was higher than the prior Hall prediction; the future weight outlook for 2026-09-21 is lower than the reference model forecast.",
        },
      ],
      opposite,
    ),
    [],
  );
  assert.ok(
    checkInComparisonIssues(
      [
        {
          path: "summary",
          text: "The reading on 2026-06-22 was lower than the prior Hall prediction; the future weight outlook for 2026-09-21 is higher than the reference model forecast.",
        },
      ],
      opposite,
    ).length,
  );
});

test("the real fasting/light-clothing presupposition is rejected while an unknown-condition question is allowed", async () => {
  const { request, evidence } = await repeated();
  request.measurements.at(-1)!.notes =
    "虚构噪声场景：这次是晚饭后穿外套、换了另一台秤量的，平常是周一早上同一台秤。现在还没有复测，饮食安排没有新困难。";
  request.sources[`log:${request.binding.asOfDate}`] =
    request.measurements.at(-1)!.notes;
  const bad = "下周一早上能否按惯例（同一台秤、空腹、穿轻便衣物）复测一次？";
  assert.match(
    checkInCopyIssues(
      [{ path: "question", text: bad }],
      request,
      evidence,
    ).join("\n"),
    /not reported as a habit/,
  );
  for (const text of [
    "这次称重时的时点、衣物和秤，与平常相比有哪些不同？",
    "这次称重时是否空腹？",
  ])
    assert.deepEqual(
      checkInCopyIssues([{ path: "question", text }], request, evidence),
      [],
    );
  request.preferences.context += " 平常在同一台秤上空腹、穿轻便衣物称重。";
  assert.deepEqual(
    checkInCopyIssues([{ path: "question", text: bad }], request, evidence),
    [],
  );
});

test("resolving the real date/type false positive does not bless its unfinished summary", async () => {
  const { request, evidence } = await repeated();
  const text =
    "The latest check-in reports a busy week and asks not to add tracking work. " +
    reportedComparison +
    " No new practical obstacle is reported; the canteen and takeaway remain available per your baseline. Numerical targets stay unchanged while we confirm whether Monday-morning weighing conditions";
  assert.deepEqual(
    checkInComparisonIssues(
      [
        { path: "summary", text },
        { path: "uncertainty", text: reportedUncertainty },
      ],
      evidence,
    ),
    [],
  );
  assert.match(
    checkInCopyIssues(
      [
        { path: "summary", text },
        { path: "uncertainty", text: reportedUncertainty },
      ],
      request,
      evidence,
    ).join("\n"),
    /complete sentence/,
  );
});

test("a grouped observation claim restores its actual residual citations alongside the common-future pair", async () => {
  const { request } = await repeated();
  const response = await runModelStage(request, {
    name: "codex",
    model: "synthetic-citation-regression",
    async run(_p, context, tools, handle) {
      const c = JSON.parse(context);
      assert.ok(
        c.evidenceOptions.some(
          (e: { comparisonType?: string }) =>
            e.comparisonType === "same_day_pre_update_residual",
        ),
      );
      const refs = [
        c.evidenceOptions.find(
          (e: { sourceId: string }) => e.sourceId === "preferences",
        ),
        c.evidenceOptions.find(
          (e: { sourceId: string }) =>
            e.sourceId === `log:${request.binding.asOfDate}`,
        ),
      ];
      const reply = await handle(tools[0].name, {
        interpretation: "insufficient_evidence",
        assessment: {
          numerical: "confirm_measurement",
          practical: "no_new_obstacle",
          barrierQuote: null,
          availabilityQuote: null,
          primaryResourceQuote: null,
          fallbackResourceQuote: null,
          reviewProposal: null,
        },
        summary: reportedComparison,
        uncertainty:
          "The conditions of individual readings remain unconfirmed.",
        questions: [
          "Did the reported scale or timing differ between those readings?",
        ],
        proposedChanges: [],
        evidence: refs.map((e) => ({ evidenceId: e.evidenceId })),
      });
      assert.equal(reply.status, "ok", JSON.stringify(reply));
    },
  });
  assert.equal(response.stage, "review_progress");
  if (response.stage !== "review_progress") throw Error("Expected coach");
  const sources = response.result.evidence;
  const residualSources = sources.filter(
    (e) => e.sourceId === "forecast" && e.quote.includes("residualKg"),
  );
  assert.ok(
    ["2026-06-08", "2026-06-15", "2026-06-22"].every((date) =>
      residualSources.some((e) => e.quote.includes(date)),
    ),
  );
  assert.ok(residualSources.every((e) => e.quote.length <= 500));
  assert.ok(sources.some((e) => e.quote.startsWith('"reference":')));
  assert.ok(sources.some((e) => e.quote.startsWith('"updated":')));
  assert.ok(
    sources.every((e) => request.sources[e.sourceId].includes(e.quote)),
  );
  assert.ok(sources.length <= 6);
});
