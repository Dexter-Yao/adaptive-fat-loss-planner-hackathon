// ABOUTME: Read-only plan-view navigation and selected phase/week presentation regressions.
// ABOUTME: Synthetic variants stay in this test; no model quality or business acceptance is inferred.
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { activeAcceptance } from "../src/application/journey-commands";
import { selectMeasurementExperience } from "../src/application/measurement-view";
import { FullPlanReader } from "../src/ui/full-plan-reader";
import { PlanFocus } from "../src/ui/plan-focus";
import { parsePlanLocation } from "../src/ui/plan-navigation";
import {
  fictionalInput,
  FIXTURE_DATE,
  journeyHarness,
} from "./support/journey-fixtures";

let props: Parameters<typeof FullPlanReader>[0];
before(async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  const s = structuredClone(h.state),
    accepted = activeAcceptance(s)!;
  const draft = s.journey.drafts.find((d) => d.id === accepted.draftId)!;
  const phase = draft.content.phases[0];
  draft.content.phases = [
    {
      ...phase,
      label: "Fictional first phase",
      endsOn: "2026-06-28",
      focus: "First phase exact saved focus.",
    },
    {
      ...phase,
      label: "Fictional later phase",
      startsOn: "2026-06-29",
      focus: "Later phase exact saved focus.",
    },
  ];
  s.weeklyPlans.forEach((w, index) => {
    w.actions[0].details = `Fictional exact action for global week ${index + 1}.`;
  });
  props = {
    content: draft.content,
    display: selectMeasurementExperience(s, FIXTURE_DATE),
    currentWeekStart: "2026-06-01",
    today: FIXTURE_DATE,
    onSelectPhase() {},
    onSelectWeek() {},
    onCheckIn() {},
  };
});
const render = (changes: Partial<typeof props> = {}) =>
  renderToStaticMarkup(createElement(FullPlanReader, { ...props, ...changes }));

test("legacy chart/measurement links resolve to the accepted overview, not an unaccepted replacement", () => {
  for (const hash of [
    "#progress",
    "#models",
    "#weekly-guidance",
    "#update-result",
    "#overview",
  ])
    assert.equal(parsePlanLocation(hash).view, "overview");
});
test("full-plan phase/week reading location is URL-owned and survives serialization", () => {
  assert.deepEqual(parsePlanLocation("#full-plan/2026-06-29/2026-07-06"), {
    view: "full-plan",
    phaseStart: "2026-06-29",
    weekStart: "2026-07-06",
  });
  assert.equal(parsePlanLocation("#complete-plan").view, "full-plan");
});
test("proposal decision anchors stay in review and unknown fragments do not invent an accepted view", () => {
  for (const hash of [
    "#review",
    "#plan-comparison",
    "#proposal-journey",
    "#plan-decision",
  ])
    assert.equal(parsePlanLocation(hash).view, "review");
  assert.equal(parsePlanLocation("").view, "automatic");
  assert.equal(parsePlanLocation("#invented-plan").view, "automatic");
});
test("full reader shows one current phase and one current week without mounting a forecast dashboard", () => {
  const html = render();
  assert.match(html, /First phase exact saved focus/);
  assert.doesNotMatch(html, /Later phase exact saved focus/);
  assert.match(html, /Fictional exact action for global week 1\./);
  assert.doesNotMatch(html, /Fictional exact action for global week 2\./);
  assert.doesNotMatch(
    html,
    /recharts|Current predictions|Your check-in and next step/,
  );
});
test("later phase uses calculator/application-owned global week numbers without restarting them at one", () => {
  const html = render({
    selectedPhaseStart: "2026-06-29",
    selectedWeekStart: "2026-07-06",
  });
  assert.match(html, /Later phase exact saved focus/);
  assert.match(html, /Week 5 ·/);
  assert.match(html, /Week 6 ·/);
  assert.doesNotMatch(html, /Week 1 ·/);
  assert.match(html, /Fictional exact action for global week 6\./);
  assert.doesNotMatch(html, /Fictional exact action for global week 5\./);
  assert.match(html, /Return to current week/);
});

test("overview orientation uses the current projected phase/week and respects the same withholding gate", () => {
  const focus = {
    headline: props.content.headline,
    phases: props.display.phases,
    week: props.display.weeks.find((w) => w.current) ?? null,
    fresh: false,
    withheld: false,
    onOpenPlan() {},
  };
  const html = renderToStaticMarkup(createElement(PlanFocus, focus));
  assert.match(html, /Fictional first phase/);
  assert.doesNotMatch(html, /Fictional later phase/);
  assert.match(html, /href="#full-plan\/2026-06-01"/);
  assert.match(html, /Guidance awaiting review/);
  const paused = renderToStaticMarkup(
    createElement(PlanFocus, { ...focus, withheld: true }),
  );
  assert.match(paused, /guidance is paused/);
  assert.doesNotMatch(paused, /Fictional first phase|This week&#x27;s focus/);
});
test("unmatched URL selections fall back to supplied phase/week facts without fabricated content", () => {
  const html = render({
    selectedPhaseStart: "2099-12-31",
    selectedWeekStart: "untrusted-selection",
  });
  assert.match(html, /First phase exact saved focus/);
  assert.match(html, /Fictional exact action for global week 1\./);
  assert.doesNotMatch(html, /2099|untrusted-selection/);
});
test("reading another phase/week never mutates accepted content or its weekly projection", () => {
  const before = structuredClone({
    content: props.content,
    display: props.display,
  });
  render({ selectedPhaseStart: "2026-06-29", selectedWeekStart: "2026-07-06" });
  assert.deepEqual({ content: props.content, display: props.display }, before);
});
