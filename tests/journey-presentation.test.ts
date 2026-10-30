// ABOUTME: Presentation regressions for saved/calculating/review/recovery states and full-horizon chart access.
// ABOUTME: Uses isolated scripted controller data; these checks do not assess Agent quality or health effectiveness.
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CheckInExperienceView } from "../src/application/journey-experience-contract";
import {
  selectCheckInExperience,
  selectPlanReview,
} from "../src/application/journey-experience-view";
import {
  CheckInResult,
  checkInStatus,
  ForecastChangeExplanation,
} from "../src/ui/check-in-result";
import { JourneyOverview } from "../src/ui/journey-overview";
import { JourneyWeek } from "../src/ui/journey-week";
import {
  fitJourneyTicks,
  journeyWeekTicks,
} from "../src/ui/forecast-projection";
import { PlanComparison } from "../src/ui/plan-comparison";
import { dateRangeLabel } from "../src/ui/labels";
import {
  fictionalInput,
  FIXTURE_DATE,
  journeyHarness,
} from "./support/journey-fixtures";

let current: CheckInExperienceView;
let h: ReturnType<typeof journeyHarness>;
const noop = () => {};
function render(update: CheckInExperienceView, extra = {}) {
  return renderToStaticMarkup(
    createElement(CheckInResult, {
      update,
      busy: false,
      onReview: noop,
      onRetry: noop,
      onCancel: noop,
      onRecalculate: noop,
      onRemeasure: noop,
      onRevise: noop,
      onDismiss: noop,
      ...extra,
    }),
  );
}
before(async () => {
  h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  await h.controller.updateMeasurement({
    date: FIXTURE_DATE,
    weightKg: 72.1,
    bodyFat: null,
    notes: "Fictional check-in",
  });
  await h.controller.reviewProgress(true);
  current = selectCheckInExperience(h.state, FIXTURE_DATE);
});

test("live calculation does not present previous coaching or forecast differences as a completed update", () => {
  const html = render({
    ...current,
    numbersFresh: false,
    forecastAvailable: false,
    task: { stage: "calculate", working: true, error: null },
  });
  assert.match(html, /Check-in saved/);
  assert.match(html, /72.1 kg/);
  assert.match(html, /Calculation in progress/);
  assert.match(html, /Waiting for the calculation/);
  assert.doesNotMatch(
    html,
    /Forecast ready|current minus accepted reference|Keep your current plan/,
  );
});

test("coach failure retains current calculator output and provides a retry without re-entry", () => {
  const html = render({
    ...current,
    task: {
      stage: "review_progress",
      working: false,
      error: "Fictional provider unavailable",
    },
  });
  assert.match(html, /Forecast ready/);
  assert.match(html, /Coach review failed/);
  assert.match(html, /Retry coach review/);
  assert.match(html, /without entering the check-in again/);
  assert.doesNotMatch(html, /Keep your current plan/);
});

test("a restored unfinished calculation is interrupted rather than silently shown as live", () => {
  const html = render({
    ...current,
    numbersFresh: false,
    forecastAvailable: false,
    task: { stage: "calculate", working: false, error: null },
  });
  assert.match(html, /Forecast update interrupted/);
  assert.match(html, /Retry forecast update/);
  assert.doesNotMatch(html, /Calculation in progress/);
});

test("compact receipts distinguish saved facts, calculation and coach recovery without claiming a review", () => {
  assert.equal(
    checkInStatus({ ...current, review: null, task: null }),
    "Forecast ready",
  );
  assert.equal(
    checkInStatus({
      ...current,
      task: { stage: "review_progress", working: false, error: "offline" },
    }),
    "Forecast ready · coach review needs retry",
  );
  assert.equal(
    checkInStatus({
      ...current,
      forecastAvailable: false,
      task: { stage: "review_progress", working: true, error: null },
    }),
    "Forecast withheld · coach review in progress",
  );
  assert.equal(
    checkInStatus({
      ...current,
      numbersFresh: false,
      forecastAvailable: false,
      task: { stage: "calculate", working: false, error: null },
    }),
    "Saved · forecast update needs retry",
  );
});

test("review pending and forecast availability remain independent", () => {
  const html = render({
    ...current,
    forecastAvailable: false,
    task: { stage: "review_progress", working: true, error: null },
  });
  assert.match(html, /Numerical forecast withheld/);
  assert.match(html, /Coach review in progress/);
  assert.doesNotMatch(html, /Forecast ready|Forecast updated/);
});

test("withheld output cannot use the quiet current-forecast path even when guidance is marked fresh", () => {
  const html = render({
    ...current,
    review: null,
    guidanceFresh: true,
    forecastAvailable: false,
    task: null,
  });
  assert.match(html, /Numerical forecast withheld/);
  assert.doesNotMatch(html, /Forecast ready/);
});

test("a note is saved without claiming a new measurement or relevant completed review", () => {
  const html = render({
    ...current,
    latest: { ...current.latest!, weightKg: null, bodyFat: null },
    review: null,
    guidanceFresh: false,
    task: null,
  });
  assert.match(html, /Note-only update · no new measurement/);
  assert.match(html, /Not reviewed for this update/);
  assert.match(html, /Ask coach to review/);
  assert.doesNotMatch(html, /72.1 kg|Keep your current plan/);
});

test("forecast delta states its same future date, direction, reference and non-residual meaning", () => {
  const html = render({
    ...current,
    forecastChange: {
      date: "2026-08-24",
      value: 0.7,
      unit: "percentage points",
    },
  });
  assert.match(html, /\+0.7.*percentage points/);
  assert.match(html, /Forecast change at.*Aug 24/);
  assert.match(html, /aria-label="About this forecast change"/);
  const details = renderToStaticMarkup(
    createElement(ForecastChangeExplanation, {
      change: { date: "2026-08-24", value: 0.7, unit: "percentage points" },
    }),
  );
  assert.match(details, /Hall prediction for.*Aug 24/);
  assert.match(details, /current minus accepted reference/);
  assert.match(details, /same future date/);
  assert.match(details, /not today&#x27;s measurement error/);
});

test("an unavailable common-date comparison does not fabricate a zero change", () => {
  const html = render({ ...current, forecastChange: null });
  assert.match(html, /same-date comparison.*unavailable/);
  assert.doesNotMatch(html, /\+0.0|current minus accepted reference/);
});

test("coach adjustments remain unaccepted and route to an existing proposal when present", () => {
  const html = render(
    {
      ...current,
      review: {
        ...current.review!,
        result: {
          ...current.review!.result,
          recommendation: "adjust_execution",
          proposedChangeSummary: "Fictional accessible option",
        },
      },
    },
    { proposalHref: "/example/plan#plan-comparison" },
  );
  assert.match(html, /Suggested adjustment · not applied/);
  assert.match(html, /Fictional accessible option/);
  assert.match(html, /Your accepted plan has not changed/);
  assert.match(html, /Review the pending alternative/);
  assert.doesNotMatch(html, /Review a plan alternative/);
});

test("a pending alternative stays accessible even without a current coach conclusion", () => {
  const html = render(
    { ...current, review: null, guidanceFresh: true },
    { proposalHref: "/example/plan#plan-comparison" },
  );
  assert.match(html, /A plan alternative is saved · not accepted/);
  assert.match(html, /Review the pending alternative/);
});

test("full plan review opens its first practical week while later weeks remain available on demand", () => {
  const content = h.state.journey.drafts[0].content;
  const html = renderToStaticMarkup(
    createElement(JourneyOverview, { content }),
  );
  assert.ok(html.includes(content.headline));
  assert.ok(html.includes(content.weeks[0].actions[0].details));
  assert.match(html, /First week/);
  assert.match(html, /Explore the remaining/);
  assert.ok(html.includes(content.phases[0].label));
});

test("saved old actions without alternatives do not acquire fictional fallback or reflection instructions", () => {
  const html = renderToStaticMarkup(
    createElement(JourneyWeek, {
      actions: [{ title: "Saved action", details: "Exact saved prose" }],
    }),
  );
  assert.match(html, /Exact saved prose/);
  assert.doesNotMatch(
    html,
    /Alternatives|If this is difficult|What to reflect on/,
  );
});

test("structured feedback remains reviewable even with no free-text note", async () => {
  await h.controller.proposeRevision(null, {
    priorities: ["fewer_actions"],
    availableTrainingMinutes: null,
    requestedGoalDate: null,
    notes: "",
  });
  const html = renderToStaticMarkup(
    createElement(PlanComparison, {
      review: selectPlanReview(h.state, FIXTURE_DATE)!,
    }),
  );
  assert.match(html, /Your feedback for this version/);
  assert.match(html, /Current accepted plan/);
  assert.match(html, /Proposed plan · not accepted/);
});

test("fit thins only axis labels and retains start/end on 84-day and 365-day journeys", () => {
  for (const end of ["2026-08-24", "2027-06-01"]) {
    const ticks = journeyWeekTicks("2026-06-01", end);
    const original = structuredClone(ticks);
    for (const width of [620, 920, 1024]) {
      const visible = fitJourneyTicks(ticks, width, 88);
      assert.deepEqual(visible[0], ticks[0]);
      assert.deepEqual(visible.at(-1), ticks.at(-1));
      assert.ok(visible.length <= ticks.length);
      for (let i = 1; i < visible.length; i++) {
        const gap =
          ((visible[i].time - visible[i - 1].time) /
            (ticks.at(-1)!.time - ticks[0].time)) *
          width;
        assert.ok(gap >= 88 - 1e-8);
      }
    }
    assert.deepEqual(ticks, original);
  }
});

test("weekly zoom restores weekly labels without changing endpoint dates", () => {
  const ticks = journeyWeekTicks("2026-06-01", "2027-05-31");
  const visible = fitJourneyTicks(ticks, (ticks.length - 1) * 88 * 2, 88);
  assert.deepEqual(visible, ticks);
});

test("a short final interval does not crowd or remove the plan-end label", () => {
  const ticks = journeyWeekTicks("2026-06-01", "2027-06-01");
  const visible = fitJourneyTicks(ticks, (ticks.length - 1) * 88 * 2, 88);
  assert.equal(visible.at(-1)!.time, ticks.at(-1)!.time);
  assert.ok(!visible.some((t) => t.time === ticks.at(-2)!.time));
  assert.equal(ticks.at(-2)!.date, "2027-05-31");
});

test("cross-year plan and phase ranges identify both years rather than repeating ambiguous month/day labels", () => {
  assert.equal(
    dateRangeLabel("2026-06-01", "2027-06-01"),
    "Jun 1, 2026 – Jun 1, 2027",
  );
  assert.equal(dateRangeLabel("2026-06-01", "2026-08-24"), "Jun 1 – Aug 24");
});
