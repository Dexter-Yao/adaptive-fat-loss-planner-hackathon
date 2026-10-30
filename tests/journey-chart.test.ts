// ABOUTME: B's chart adapter/projection preserve exact facts, failures and one accepted date mapping.
// ABOUTME: Scenarios use real deterministic model output; they do not establish clinical accuracy.
import assert from "node:assert/strict";
import test, { before } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  chartFixture,
  chartPreviewCases,
  CHART_DATE,
} from "./support/chart-fixtures";
import { selectJourneyChartInput } from "../src/application/journey-chart-view";
import {
  chartProjection,
  chartModelStates,
  chartPeriodLabel,
  journeyWeekTicks,
} from "../src/ui/forecast-projection";
import {
  phaseTimeline,
  timelineTime,
} from "../src/application/journey-timeline";
import { JourneyChart } from "../src/ui/journey-chart";
import { addDays } from "../src/domain/facts";
import { observation } from "./support/fixtures";
let fixture: Awaited<ReturnType<typeof chartFixture>>;
let cases: Awaited<ReturnType<typeof chartPreviewCases>>;
before(async () => {
  fixture = await chartFixture();
  cases = await chartPreviewCases();
});
test("adapter preserves canonical result/observation identity and binds current versions", () => {
  const { h, input, summary, today } = fixture,
    before = JSON.stringify(h.state);
  const view = selectJourneyChartInput(h.state, today, summary)!;
  assert.equal(view.forecast, h.state.snapshot!.forecast);
  assert.equal(view.observations, h.state.logs);
  assert.equal(view.period, summary.period);
  assert.equal(view.binding.acceptedJourneyId, input.binding.acceptedJourneyId);
  assert.equal(view.binding.sourceRevision, h.state.sourceRevision);
  assert.equal(view.freshness, "current");
  assert.equal(JSON.stringify(h.state), before);
  const reorderedGoal = {
    requestedDate: summary.goal.requestedDate,
    value: summary.goal.value,
    kind: summary.goal.kind,
    id: summary.goal.id,
  };
  assert.ok(
    selectJourneyChartInput(h.state, today, {
      ...summary,
      goal: reorderedGoal,
    }),
  );
});
test("adapter rejects another goal/active period and returns no fabricated plan before acceptance", () => {
  const { h, summary, today } = fixture;
  assert.throws(
    () =>
      selectJourneyChartInput(h.state, today, {
        ...summary,
        goal: { ...summary.goal, value: 60 },
      }),
    /does not match/,
  );
  assert.throws(
    () =>
      selectJourneyChartInput(h.state, today, {
        ...summary,
        activePlanPeriod: {
          startsOn: CHART_DATE,
          endsOn: addDays(CHART_DATE, 90),
        },
      }),
    /does not match/,
  );
  assert.equal(
    selectJourneyChartInput(h.state, today, { ...summary, period: null }),
    null,
  );
  const unaccepted = structuredClone(h.state);
  unaccepted.journey.acceptances = [];
  assert.equal(selectJourneyChartInput(unaccepted, today, summary), null);
});
test("snapshot absence and later facts are explicit availability states, not silently current predictions", () => {
  const { h, summary, today } = fixture,
    stale = structuredClone(h.state);
  stale.sourceRevision++;
  assert.equal(
    selectJourneyChartInput(stale, today, summary)!.freshness,
    "stale",
  );
  stale.snapshot = null;
  const absent = selectJourneyChartInput(stale, today, summary)!;
  assert.equal(absent.freshness, "unavailable");
  assert.equal(absent.forecast, null);
  assert.ok(absent.reference);
});
test("real check-ins are copied with their source week and no new date is invented", () => {
  assert.deepEqual(
    fixture.input.checkIns,
    fixture.h.state.weeklyPlans.flatMap((w) =>
      w.checkIn
        ? [
            {
              weekStart: w.weekStart,
              date: w.checkIn.date,
              label: w.checkIn.label,
            },
          ]
        : [],
    ),
  );
  assert.equal(fixture.input.checkIns[0].date, "2026-10-18");
  assert.equal(fixture.input.checkIns.at(-1)!.date, "2026-11-12");
});
test("weekly anchors include the partial first week and exact end without extending the range", () => {
  const ticks = journeyWeekTicks(
    CHART_DATE,
    "2026-11-12",
    fixture.input.checkIns.map((c) => c.weekStart),
  );
  assert.deepEqual(
    ticks.map((t) => t.date),
    [
      "2026-10-15",
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
      "2026-11-12",
    ],
  );
  assert.deepEqual(
    ticks.filter((t) => t.kind === "week").map((t) => t.week),
    [1, 2, 3, 4, 5],
  );
  assert.equal(ticks.at(-1)!.kind, "end");
});
test("long, leap/DST-crossing, and one-day date maps remain ordered and bounded", () => {
  for (const [start, end] of [
    ["2026-10-29", "2027-10-29"],
    ["2028-02-27", "2028-03-13"],
    ["2026-10-29", "2026-10-29"],
  ]) {
    const ticks = journeyWeekTicks(start, end);
    assert.equal(ticks[0].date, start);
    assert.equal(ticks.at(-1)!.date, end);
    assert.ok(
      ticks.every(
        (t, i) =>
          t.time >= timelineTime(start) &&
          t.time <= timelineTime(end) &&
          (i === 0 || t.time > ticks[i - 1].time),
      ),
    );
  }
  assert.deepEqual(journeyWeekTicks("2026-11-01", "2026-10-29"), []);
  assert.equal(
    chartPeriodLabel("2026-10-15", "2027-10-15"),
    "Oct 15, 2026 – Oct 15, 2027",
  );
  assert.equal(chartPeriodLabel("2026-10-15", "2026-11-12"), "Oct 15 – Nov 12");
});
test("weekly labels retain earlier goal history when check-ins belong only to a later revision", () => {
  const complete = journeyWeekTicks("2026-10-15", "2026-11-12");
  assert.deepEqual(
    journeyWeekTicks("2026-10-15", "2026-11-12", ["2026-11-02", "2026-11-09"]),
    complete,
  );
});
test("clipping to the goal period retains exact model values and preserves outside measurements", () => {
  const { input } = fixture,
    before = JSON.stringify(input),
    outside = observation(addDays(input.period.startsOn, -1), { weightKg: 91 });
  const raw = [outside, ...input.observations],
    period = {
      startsOn: addDays(CHART_DATE, 2),
      endsOn: addDays(CHART_DATE, 20),
    };
  const p = chartProjection(
    input.forecast,
    raw,
    "weight",
    "current",
    ["hall", "thomas", "antonetti"],
    undefined,
    input.profile,
    undefined,
    { period },
  );
  for (const id of p.supported)
    for (const point of input
      .forecast!.modelResults.find((m) => m.id === id)!
      .current.filter(
        (p) => p.date >= period.startsOn && p.date <= period.endsOn,
      ))
      assert.equal(
        p.rows.find((r) => r.date === point.date)![id],
        point.weightKg,
      );
  assert.ok(
    p.rows.every((r) => r.date >= period.startsOn && r.date <= period.endsOn),
  );
  assert.equal(raw[0].weightKg, 91);
  assert.equal(JSON.stringify(input), before);
});
test("an individual failure stays visible while remaining curves retain their own outputs", () => {
  const input = cases["model-failure"],
    states = chartModelStates(input.forecast, "weight");
  assert.equal(states.find((s) => s.id === "thomas")!.status, "failed");
  assert.match(states.find((s) => s.id === "thomas")!.message, /Simulated/);
  const p = chartProjection(
    input.forecast,
    input.observations,
    "weight",
    "current",
    ["hall", "thomas", "antonetti"],
  );
  assert.ok(!p.supported.includes("thomas"));
  assert.ok(p.rows.every((r) => r.thomas === undefined));
  assert.equal(
    p.rows[0].hall,
    input.forecast!.modelResults.find((m) => m.id === "hall")!.current[0]
      .weightKg,
  );
});
test("body-fat-only updates never create a measured weight or an Antonetti body-fat prediction", () => {
  const input = cases["body-fat-only"],
    observed = input.observations[0];
  assert.equal(observed.weightKg, null);
  const fat = chartProjection(
    input.forecast,
    input.observations,
    "body_fat",
    "current",
    ["hall", "thomas", "antonetti"],
    undefined,
    input.profile,
  );
  assert.equal(fat.rows.find((r) => r.date === observed.date)!.recorded, 31.5);
  assert.ok(fat.rows.every((r) => r.antonetti === undefined));
  assert.equal(
    chartModelStates(input.forecast, "body_fat").find(
      (s) => s.id === "antonetti",
    )!.status,
    "unsupported",
  );
  const weight = chartProjection(
    input.forecast,
    input.observations,
    "weight",
    "current",
    ["hall"],
    undefined,
    input.profile,
  );
  assert.equal(
    weight.rows.find((r) => r.date === observed.date)!.recorded,
    undefined,
  );
});
test("simultaneous comparison failures retain Hall and measurements without using reference as fallback", () => {
  const input = cases["multiple-failures"];
  assert.equal(
    chartModelStates(input.forecast, "weight").filter(
      (model) => model.status === "failed",
    ).length,
    2,
  );
  const p = chartProjection(
    input.forecast,
    input.observations,
    "weight",
    "current",
    ["hall", "thomas", "antonetti"],
    undefined,
    input.profile,
  );
  assert.deepEqual(p.supported, ["hall"]);
  assert.ok(p.rows.some((row) => row.recorded === 71.5));
  assert.ok(p.rows.every((row) => row.reference === undefined));
  const html = renderToStaticMarkup(
    createElement(JourneyChart, {
      input,
      metric: "weight",
      selectedPhase: null,
      onSelectPhase() {},
      onMetricChange() {},
    }),
  );
  assert.equal((html.match(/Calculation failed/g) ?? []).length, 2);
});
test("actual measurements remain available without any current forecast and are not replaced by reference", () => {
  const input = cases["forecast-unavailable"];
  const p = chartProjection(
    null,
    input.observations,
    "weight",
    "current",
    ["hall", "thomas", "antonetti"],
    undefined,
    input.profile,
  );
  assert.deepEqual(p.supported, []);
  assert.ok(p.rows.some((r) => r.recorded === 71.5));
  assert.ok(
    p.rows.every((r) => r.hall === undefined && r.reference === undefined),
  );
  assert.ok(
    chartModelStates(null, "weight").every((m) => m.status === "unavailable"),
  );
});
test("one unchanged Hall reference is optional, with no copied reference for other models", () => {
  const input = fixture.input,
    before = JSON.stringify(input.reference);
  const p = chartProjection(
    input.forecast,
    input.observations,
    "weight",
    "current",
    ["hall", "thomas", "antonetti"],
    undefined,
    input.profile,
    input.reference!,
  );
  for (const r of p.rows)
    assert.equal(
      r.reference,
      input.reference!.modelResults[0].current.find(
        (point) => point.date === r.date,
      )?.weightKg,
    );
  assert.equal(JSON.stringify(input.reference), before);
});
test("check-in coordinates and phase geometry use the same UTC chart mapping", () => {
  const input = cases.long,
    first = timelineTime(input.period.startsOn),
    last = timelineTime(input.period.endsOn);
  const phases = phaseTimeline(input.phases, first, last);
  assert.equal(phases[0].start, first);
  assert.equal(phases.at(-1)!.end, last);
  for (const c of input.checkIns)
    assert.equal(
      new Date(timelineTime(c.date)).toISOString().slice(0, 10),
      c.date,
    );
  assert.ok(
    journeyWeekTicks(
      input.period.startsOn,
      input.period.endsOn,
      input.checkIns.map((c) => c.weekStart),
    ).length > 50,
  );
});
test("controlled public component reports applicable failures, hides unsupported model choices and defaults reference off", () => {
  const html = renderToStaticMarkup(
    createElement(JourneyChart, {
      input: cases["model-failure"],
      metric: "body_fat",
      selectedPhase: null,
      onSelectPhase() {},
      onMetricChange() {},
    }),
  );
  assert.match(html, /Thomas \/ Pennington model/);
  assert.match(html, /Simulated Thomas calculation failure/);
  assert.ok(!html.includes('aria-label="Compare Modified Antonetti model"'));
  assert.match(html, /About forecast models and check-ins/);
  assert.ok(!html.includes("success probability"));
});
