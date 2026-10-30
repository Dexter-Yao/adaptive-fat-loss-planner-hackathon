// ABOUTME: Chart presentation must preserve exact measured values, supported capabilities and sensitivity bounds.
// ABOUTME: These are projection checks; they do not claim visual fidelity or physiological accuracy.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { calculateForecast } from "../src/planning/evaluate";
import {
  chartDateLabel,
  chartProjection,
  chartModelStates,
} from "../src/ui/forecast-projection";
import { ForecastLegend } from "../src/ui/forecast-legend";
import { observation, requestAt } from "./support/fixtures";
const request = requestAt(),
  forecast = calculateForecast(request);
test("a temporary model comparison names the independent saved default and omits unsupported models", () => {
  const html = renderToStaticMarkup(
    createElement(ForecastLegend, {
      metric: "body_fat",
      states: chartModelStates(forecast, "body_fat"),
      selection: "thomas",
      defaultSelection: "mean",
      meanModelCount: 2,
      onSelect() {},
      onPin() {},
      hasMeasurements: true,
    }),
  );
  assert.match(html, /Body-fat.*default:.*Model mean/);
  assert.match(html, /aria-label="Compare Thomas[^\"]*" aria-pressed="true"/);
  assert.match(html, /Use selected as default/);
  assert.doesNotMatch(html, /Modified Antonetti/);
});
test("chart points retain exact authoritative state and an observation without anchoring", () => {
  const date = request.profile.startDate,
    actual = observation(date, { weightKg: 90 });
  const v = chartProjection(forecast, [actual], "weight", "current", ["hall"]);
  assert.equal(v.rows[0].hall, forecast.modelResults[0].current[0].weightKg);
  assert.equal(v.rows[0].recorded, 90);
  assert.notEqual(v.rows[0].hall, 90);
  assert.ok(v.rows.every((r, i) => i === 0 || r.time > v.rows[i - 1].time));
});
test("only single-model current conditions includes an ordered missing-meal sensitivity range", () => {
  const v = chartProjection(forecast, [], "weight", "current", ["hall"]);
  assert.ok(v.hasRange);
  assert.ok(v.rows.some((r) => r.range));
  for (const r of v.rows) if (r.range) assert.ok(r.range[0] <= r.range[1]);
  assert.equal(
    chartProjection(forecast, [], "weight", "accepted", ["hall"]).hasRange,
    false,
  );
  assert.equal(
    chartProjection(forecast, [], "weight", "current", [
      "hall",
      "thomas",
      "antonetti",
    ]).hasRange,
    false,
  );
});
test("body-fat chart excludes an unsupported model and preserves the measurement unit", () => {
  const l = observation(request.asOfDate!, {
      bodyFat: { percent: 27.3, method: "dxa" },
    }),
    v = chartProjection(forecast, [l], "body_fat", "current", [
      "hall",
      "thomas",
      "antonetti",
    ]);
  assert.ok(!v.supported.includes("antonetti"));
  assert.ok(v.rows.every((r) => r.antonetti === undefined));
  assert.equal(v.rows.find((r) => r.date === l.date)!.recorded, 27.3);
});
test("a missing measurement does not create a recorded point from a model estimate", () => {
  const v = chartProjection(
    forecast,
    [observation(request.asOfDate!)],
    "body_fat",
    "current",
    ["hall"],
  );
  assert.ok(v.rows.every((r) => r.recorded === undefined));
});
test("initial measured physiology is plotted, while estimated baseline body fat is not a reported point", () => {
  const measured = {
    ...request.profile,
    bodyFat: { percent: 27.5, method: "dxa" as const },
  };
  const yes = chartProjection(
    forecast,
    [],
    "body_fat",
    "current",
    ["hall"],
    undefined,
    measured,
  );
  assert.equal(yes.rows[0].recorded, 27.5);
  const no = chartProjection(
    forecast,
    [],
    "body_fat",
    "current",
    ["hall"],
    undefined,
    { ...measured, bodyFat: null },
  );
  assert.ok(no.rows.every((r) => r.recorded === undefined));
  const weight = chartProjection(
    forecast,
    [],
    "weight",
    "current",
    ["hall"],
    undefined,
    request.profile,
  );
  assert.equal(weight.rows[0].recorded, request.profile.weightKg);
});
test("tooltip dates use the row date when Recharts supplies a series label", () => {
  assert.equal(chartDateLabel("Hall", "2026-10-28"), "Oct 28");
  assert.equal(chartDateLabel(Date.parse("2026-10-28T12:00:00Z")), "Oct 28");
  assert.equal(chartDateLabel("2026-10-28"), "Oct 28");
  assert.equal(chartDateLabel("Recorded"), "Forecast date");
});
test("accepted reference is plotted unchanged alongside the current forecast", () => {
  const original = structuredClone(forecast);
  original.modelResults[0].current[0].weightKg = 101;
  const view = chartProjection(
    forecast,
    [],
    "weight",
    "current",
    ["hall"],
    undefined,
    undefined,
    original,
  );
  const point = view.rows.find(
    (r) => r.date === original.modelResults[0].current[0].date,
  )!;
  assert.equal(point.reference, 101);
  assert.equal(point.hall, forecast.modelResults[0].current[0].weightKg);
  assert.ok(view.max > 101);
  assert.equal(forecast.modelResults[0].current[0].weightKg !== 101, true);
});
