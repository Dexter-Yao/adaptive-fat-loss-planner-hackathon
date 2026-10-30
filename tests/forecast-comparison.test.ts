// ABOUTME: Comparison, illustration and saved-view invariants; no synthetic passing case proves personal accuracy.
import assert from "node:assert/strict";
import test from "node:test";
import { forecastMean } from "../src/application/forecast-comparison";
import {
  dailyVariation,
  DAILY_VARIATION_POLICY,
} from "../src/application/daily-variation";
import {
  ForecastDisplaySchema,
  pinForecastSelection,
  sameForecastBusinessState,
} from "../src/application/forecast-display";
import {
  loadSession,
  migrateSession,
  persistSession,
} from "../src/application/persistence";
import { buildCoachRequest, SessionSchema } from "../src/application/session";
import { SessionCoreSchema } from "../src/application/session";
import { calculateForecast } from "../src/planning/evaluate";
import { modelResult } from "../src/domain/forecast";
import { addDays } from "../src/domain/facts";
import { timelineTime } from "../src/application/journey-timeline";
import { chartProjection } from "../src/ui/forecast-projection";
import {
  fictionalInput,
  journeyHarness,
  FIXTURE_DATE,
  fictionalStage,
} from "./support/journey-fixtures";
import { requestAt } from "./support/fixtures";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JourneyChart } from "../src/ui/journey-chart";
import { selectJourneyChartInput } from "../src/application/journey-chart-view";
import { selectGoalProgress } from "../src/application/goal-progress-view";
const ids = ["hall", "thomas", "antonetti"] as const;
const request = requestAt(),
  forecast = calculateForecast(request);

test("weight mean uses three common-date outputs; body fat uses only its two supporting models", () => {
  const controlled = structuredClone(forecast);
  const dates = [forecast.asOfDate, addDays(forecast.asOfDate, 1)];
  const weights = [
    [80, 76],
    [82, 78],
    [84, 80],
  ];
  const fats = [
    [30, 28],
    [32, 30],
    [null, null],
  ];
  ids.forEach((id, index) => {
    const model = modelResult(controlled, id),
      template = model.current[0];
    model.current = dates.map((date, day) => ({
      ...template,
      date,
      weightKg: weights[index][day],
      bodyFatPct: fats[index][day],
    }));
  });
  assert.deepEqual(forecastMean(controlled, "weight", "current", ids), {
    models: [...ids],
    points: [
      { date: dates[0], value: 82 },
      { date: dates[1], value: 78 },
    ],
  });
  assert.deepEqual(forecastMean(controlled, "body_fat", "current", ids), {
    models: ["hall", "thomas"],
    points: [
      { date: dates[0], value: 31 },
      { date: dates[1], value: 29 },
    ],
  });
});

test("view-only updates preserve a pending coach task; real fact changes remain distinguishable for cross-tab cancellation", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  let release!: (response: Awaited<ReturnType<typeof fictionalStage>>) => void;
  let arrived!: (request: Parameters<typeof fictionalStage>[0]) => void;
  const pending = new Promise<Parameters<typeof fictionalStage>[0]>(
    (resolve) => {
      arrived = resolve;
    },
  );
  h.ports.stage = async (request) => {
    arrived(request);
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const update = h.controller.updateMeasurement({
    date: FIXTURE_DATE,
    weightKg: 73.1,
    bodyFat: { percent: 31.5, method: "bia" },
    notes: "Fictional measurement.",
  });
  const stage = await pending;
  const before = h.state;
  const displayed = SessionSchema.parse({
    ...before,
    forecastDisplay: pinForecastSelection(
      before.forecastDisplay,
      "weight",
      "thomas",
    ),
  });
  assert.equal(sameForecastBusinessState(before, displayed), true);
  assert.equal(
    sameForecastBusinessState(before, {
      ...displayed,
      sourceRevision: before.sourceRevision + 1,
    }),
    false,
  );
  h.replace(displayed);
  release(await fictionalStage(stage));
  await update;
  assert.equal(h.state.forecastDisplay.defaults.weight, "thomas");
  assert.notEqual(h.state.journey.task?.status, "interrupted");
  assert.equal(h.state.journey.reviews.length, 1);
});
test("a missing date or nonfinite value produces a gap, not a changing denominator or carried prediction", () => {
  const f = structuredClone(forecast),
    date = f.modelResults[0].current[3].date;
  const thomas = modelResult(f, "thomas");
  thomas.current = thomas.current.filter((p) => p.date !== date);
  assert.ok(
    !forecastMean(f, "weight", "current", ids).points.some(
      (p) => p.date === date,
    ),
  );
  thomas.current[4].weightKg = Number.NaN;
  assert.ok(
    !forecastMean(f, "weight", "current", ids).points.some(
      (p) => p.date === thomas.current[4].date,
    ),
  );
});
test("unavailable models are excluded explicitly; no reference or other scenario enters the mean", () => {
  const f = structuredClone(forecast);
  const thomas = modelResult(f, "thomas");
  thomas.status = "failed";
  thomas.current = [];
  const antonetti = modelResult(f, "antonetti");
  antonetti.status = "failed";
  antonetti.current = [];
  const hall = modelResult(f, "hall");
  hall.accepted[0].weightKg = 150;
  const mean = forecastMean(f, "weight", "current", ids);
  assert.deepEqual(mean.models, ["hall"]);
  assert.equal(mean.points[0].value, hall.current[0].weightKg);
  assert.notEqual(mean.points[0].value, 150);
  assert.deepEqual(forecastMean(null, "weight", "current", ids), {
    models: [],
    points: [],
  });
});
test("comparison and illustration preserve exact observations, original model points and reference", () => {
  const before = JSON.stringify(forecast);
  const projection = chartProjection(
    forecast,
    [],
    "weight",
    "current",
    [...ids],
    undefined,
    request.profile,
    forecast,
    { includeMean: true },
  );
  assert.equal(projection.rows[0].recorded, request.profile.weightKg);
  assert.equal(
    projection.rows[0].hall,
    modelResult(forecast, "hall").current[0].weightKg,
  );
  assert.equal(projection.rows[0].reference, projection.rows[0].hall);
  dailyVariation(
    forecastMean(forecast, "weight", "current", ids).points,
    request.profile.startDate,
    forecast.projectionDate,
    forecast.asOfDate,
    "fixture",
  );
  assert.equal(JSON.stringify(forecast), before);
});
test("future AM/PM examples are bounded, stable across repeat/zoom and cannot become actual points", () => {
  const startsOn = "2026-10-29",
    endsOn = "2026-11-12",
    asOf = "2026-11-02";
  const trend = Array.from({ length: 15 }, (_, i) => ({
    date: addDays(startsOn, i),
    value: 80 - i * 0.05,
  }));
  const points = dailyVariation(
    trend,
    startsOn,
    endsOn,
    asOf,
    "stable-session",
  );
  assert.deepEqual(
    points,
    dailyVariation(trend, startsOn, endsOn, asOf, "stable-session"),
  );
  assert.ok(points.length > 0);
  for (const p of points) {
    assert.ok(
      p.date >= asOf &&
        p.time >= timelineTime(startsOn) &&
        p.time <= timelineTime(endsOn),
    );
    const fraction = Math.abs(p.illustration / p.trend - 1);
    assert.ok(fraction >= DAILY_VARIATION_POLICY.minimumHalfRange - 1e-12);
    assert.ok(fraction <= DAILY_VARIATION_POLICY.maximumHalfRange + 1e-12);
    assert.equal(p.illustration < p.trend, p.period === "morning");
    assert.ok(!("recorded" in p));
  }
  const fromLaterWindow = dailyVariation(
    trend,
    "2026-11-04",
    endsOn,
    asOf,
    "stable-session",
  );
  assert.deepEqual(
    fromLaterWindow,
    points.filter((p) => p.time >= timelineTime("2026-11-04")),
  );
  assert.notDeepEqual(
    points,
    dailyVariation(trend, startsOn, endsOn, asOf, "other-session"),
  );
});
test("display defaults remain compatible with v6 data and cannot pin Antonetti to body fat", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  const old = JSON.parse(JSON.stringify(h.state));
  delete old.forecastDisplay;
  const migrated = migrateSession(JSON.stringify(old));
  assert.deepEqual(migrated.forecastDisplay, {
    defaults: { weight: "mean", body_fat: "mean" },
    dailyVariation: true,
  });
  assert.throws(() =>
    pinForecastSelection(migrated.forecastDisplay, "body_fat", "antonetti"),
  );
  assert.deepEqual(migrated.logs, h.state.logs);
});
test("pinning and readback do not change calculation inputs, versions, targets or model calls", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  const before = structuredClone(h.state),
    calls = h.calls.length,
    calculations = h.calculations.length;
  const next = SessionSchema.parse({
    ...h.state,
    forecastDisplay: pinForecastSelection(
      h.state.forecastDisplay,
      "weight",
      "thomas",
    ),
  });
  persistSession(h.storage, next, h.state);
  const reopened = loadSession(h.storage).session!;
  assert.equal(reopened.forecastDisplay.defaults.weight, "thomas");
  assert.equal(reopened.forecastDisplay.defaults.body_fat, "mean");
  assert.deepEqual(
    SessionCoreSchema.parse(reopened),
    SessionCoreSchema.parse(before),
  );
  assert.deepEqual(
    buildCoachRequest(reopened, FIXTURE_DATE),
    buildCoachRequest(before, FIXTURE_DATE),
  );
  assert.equal(h.calls.length, calls);
  assert.equal(h.calculations.length, calculations);
});
test("failed display persistence keeps the last default and a replan preserves the root's saved choice", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  h.storage.fail = true;
  const pinned = SessionSchema.parse({
    ...h.state,
    forecastDisplay: pinForecastSelection(
      h.state.forecastDisplay,
      "weight",
      "antonetti",
    ),
  });
  assert.throws(() => h.replace(pinned), /Storage quota/);
  assert.equal(h.state.forecastDisplay.defaults.weight, "mean");
  h.storage.fail = false;
  h.replace(pinned);
  await h.controller.beginReplanning();
  await h.controller.generateReplanning();
  await h.controller.acceptReplanning();
  assert.equal(h.state.forecastDisplay.defaults.weight, "antonetti");
  assert.equal(h.state.archives.length, 1);
  assert.deepEqual(ForecastDisplaySchema.parse({}), {
    defaults: { weight: "mean", body_fat: "mean" },
    dailyVariation: true,
  });
});

test("a failed pinned model remains explicit, with actual reports available and no silent mean substitution", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  const input = selectJourneyChartInput(
    h.state,
    FIXTURE_DATE,
    selectGoalProgress(h.state, FIXTURE_DATE).summary,
  )!;
  const failing = structuredClone(input);
  const result = modelResult(failing.forecast!, "thomas");
  result.status = "failed";
  result.current = [];
  result.error = "Fictional unavailable comparison";
  const html = renderToStaticMarkup(
    createElement(JourneyChart, {
      input: failing,
      metric: "weight",
      selectedPhase: null,
      onSelectPhase() {},
      onMetricChange() {},
      display: pinForecastSelection(
        h.state.forecastDisplay,
        "weight",
        "thomas",
      ),
    }),
  );
  assert.match(html, /Your selected model is unavailable/);
  assert.match(html, /Actual measurements/);
  assert.match(html, /Fictional unavailable comparison/);
  assert.ok(!html.includes("Daily fluctuation · illustration"));
});
