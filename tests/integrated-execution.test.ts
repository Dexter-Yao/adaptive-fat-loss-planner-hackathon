// ABOUTME: Integration guards prevent outer timeouts truncating valid multi-batch generation.
import assert from "node:assert/strict";
import test from "node:test";
import {
  JOURNEY_GENERATION_TIMEOUT_MS,
  journeyRequestTimeoutMs,
} from "../src/domain/execution-policy";
import { maxDuration } from "../src/app/api/journey/route";
import { workflowErrorText } from "../src/ui/workflow-error";
test("transport and route budgets cover the whole bounded journey, not only one model batch", () => {
  assert.ok(JOURNEY_GENERATION_TIMEOUT_MS < maxDuration * 1000);
  for (const stage of ["generate", "revise"])
    assert.ok(journeyRequestTimeoutMs(stage) >= maxDuration * 1000);
  assert.ok(
    journeyRequestTimeoutMs("calculate") < journeyRequestTimeoutMs("generate"),
  );
});
test("persisted timeout and bounded-repair failures offer recovery without raw transport jargon", () => {
  for (const reason of [
    "signal timed out",
    "The operation was aborted due to timeout",
  ])
    assert.equal(
      workflowErrorText(reason),
      "This update took too long to complete.",
    );
  assert.match(
    workflowErrorText(
      "The stage exhausted its bounded submission budget; retry explicitly.",
    ),
    /could not complete a valid update/,
  );
});

test("a paused scope hides phase instructions while retaining the forecast/measurement interface", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { journeyHarness, fictionalInput, FIXTURE_DATE } = await import(
    "./support/journey-fixtures"
  );
  const { saveMeasurement } = await import(
    "../src/application/journey-commands"
  );
  const { selectGoalProgress } = await import(
    "../src/application/goal-progress-view"
  );
  const { selectJourneyChartInput } = await import(
    "../src/application/journey-chart-view"
  );
  const { JourneyChart } = await import("../src/ui/journey-chart");
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  const next = saveMeasurement(
    h.state,
    {
      date: FIXTURE_DATE,
      weightKg: null,
      bodyFat: null,
      notes: "Fictional scope check: I am pregnant.",
    },
    FIXTURE_DATE,
  ).session;
  const input = selectJourneyChartInput(
    next,
    FIXTURE_DATE,
    selectGoalProgress(next, FIXTURE_DATE).summary,
  )!;
  assert.equal(input.guidanceWithheld, true);
  const html = renderToStaticMarkup(
    createElement(JourneyChart, {
      input,
      metric: "weight",
      selectedPhase: input.phases[0].startsOn,
      onSelectPhase() {},
      onMetricChange() {},
    }),
  );
  assert.match(html, /Phase guidance is paused/);
  assert.ok(!html.includes(input.phases[0].focus));
  assert.match(html, /Actual measurements/);
});
