// ABOUTME: Page labels preserve requested/accepted dates, measurement units and A-owned assessment semantics.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GoalProgressView } from "../src/application/goal-progress-contract";
import { GoalSummary } from "../src/ui/goal-summary";
import { ProgressCards } from "../src/ui/progress-cards";
import { MeasurementAction } from "../src/ui/measurement-action";
import { workflowErrorText } from "../src/ui/workflow-error";
const unknown: GoalProgressView = {
  summary: {
    goal: {
      id: "fictional",
      kind: "weight",
      value: 70,
      requestedDate: "2026-11-26",
    },
    period: {
      startsOn: "2026-10-29",
      endsOn: "2026-12-03",
      endSource: "accepted_revision",
      durationDays: 35,
    },
    activePlanPeriod: { startsOn: "2026-11-01", endsOn: "2026-12-03" },
  },
  baseline: {
    status: "available",
    reading: { metric: "weight", value: 72, unit: "kg" },
    date: "2026-10-29",
    source: "profile_report",
    method: null,
  },
  latest: {
    status: "available",
    reading: { metric: "weight", value: 71.5, unit: "kg" },
    date: "2026-11-03",
    source: "observation",
    method: null,
  },
  outlook: {
    status: "unknown",
    reason: "stale",
    message: "Latest measurements are not included yet.",
    binding: {
      sessionId: "fictional",
      sourceRevision: 2,
      snapshotSourceRevision: 1,
      acceptedJourneyId: "accepted",
      asOfDate: "2026-11-03",
      inputHash: null,
    },
  },
};
test("whole-goal header separates the original requested date, current revised end and revision start", () => {
  const html = renderToStaticMarkup(
    createElement(GoalSummary, { summary: unknown.summary }),
  );
  assert.match(html, /Requested deadline/);
  assert.match(html, /Nov 26/);
  assert.match(html, /Whole journey/);
  assert.match(html, /35 days/);
  assert.match(html, /Accepted revised finish/);
  assert.match(html, /Dec 3/);
  assert.match(html, /Current revision begins/);
  assert.match(html, /Nov 1/);
});
test("unknown outlook stays neutral with no fabricated success or repeated target card", () => {
  const html = renderToStaticMarkup(
    createElement(ProgressCards, { progress: unknown }),
  );
  assert.match(html, /Starting measurement/);
  assert.match(html, /72.0 kg/);
  assert.match(html, /Latest measurement/);
  assert.match(html, /71.5 kg/);
  assert.match(html, /data-state="unknown"/);
  assert.match(html, /Not assessed/);
  assert.match(html, /Latest measurements are not included yet/);
  assert.ok(!html.includes("On track under current assumptions"));
  assert.ok(!html.includes("70.0 kg"));
});
test("outlook tint consumes A's status while body-fat readings keep their own units and dates", () => {
  const p: GoalProgressView = {
    ...unknown,
    baseline: {
      status: "not_recorded",
      metric: "body_fat",
      reason: "No reported baseline body fat.",
    },
    latest: {
      status: "available",
      reading: { metric: "body_fat", value: 28.7, unit: "percent" },
      date: "2026-11-02",
      source: "observation",
      method: "bia",
    },
    outlook: {
      status: "ready",
      binding: unknown.outlook.binding,
      model: "hall",
      projectedAtGoalDate: {
        date: "2026-12-03",
        reading: { metric: "weight", value: 71.2, unit: "kg" },
      },
      deviationAtGoalDate: { metric: "weight", value: 1.2, unit: "kg" },
      estimatedArrivalDate: null,
      arrivalDelayDays: null,
      evaluatedThrough: "2026-12-03",
      assessment: "needs_review",
      reason: "The current assumptions fall short of the accepted goal.",
      policyVersion: "fixture",
    },
  };
  const html = renderToStaticMarkup(
    createElement(ProgressCards, { progress: p }),
  );
  assert.match(html, /28.7%/);
  assert.match(html, /Nov 2/);
  assert.match(html, /71.2 kg/);
  assert.match(html, /data-state="needs_review"/);
  assert.match(html, /No reported baseline body fat/);
  assert.ok(!html.includes("success rate"));
});
test("the graphic primary action retains an explicit accessible measurement label", () => {
  const html = renderToStaticMarkup(
    createElement(MeasurementAction, { onClick() {} }),
  );
  assert.match(html, /aria-label="Update measurements"/);
  assert.match(html, /measurement-action-symbol/);
  assert.ok(!html.includes("Running"));
});
test("validation and bounded model failures stay readable without reporting success", () => {
  const repeated = Array.from(
    { length: 17 },
    (_, i) =>
      `weeks.${i}.actions.0.successCheck: fictional checked-output failure`,
  ).join("\n");
  assert.equal(
    workflowErrorText(repeated),
    "The generated plan could not pass its checks. Retry or review your details.",
  );
  assert.equal(repeated.split("\n").length, 17);
  const raw = JSON.stringify([
    {
      code: "unrecognized_keys",
      path: ["result", "phases", 0],
      message: "Unrecognized key: guidance",
    },
  ]);
  assert.match(workflowErrorText(raw), /could not be validated/);
  assert.match(
    workflowErrorText(
      "The stage used its candidate and one repair; retry explicitly.",
    ),
    /could not complete a valid update/,
  );
  assert.equal(
    workflowErrorText("Storage quota exceeded"),
    "Storage quota exceeded",
  );
});
