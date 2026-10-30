// ABOUTME: Phase geometry and phase-to-week presentation retain dated facts and crossing-week coverage.
import assert from "node:assert/strict";
import test from "node:test";
import {
  phaseTimeline,
  timelineTime,
} from "../src/application/journey-timeline";
import { selectMeasurementExperience } from "../src/application/measurement-view";
import { journeyHarness, fictionalInput } from "./support/journey-fixtures";
const phases = [
  {
    startsOn: "2026-10-29",
    endsOn: "2026-11-08",
    label: "Start",
    focus: "Make a routine",
  },
  {
    startsOn: "2026-11-09",
    endsOn: "2026-11-22",
    label: "Hold",
    focus: "Keep a routine",
  },
  {
    startsOn: "2026-11-23",
    endsOn: "2026-11-26",
    label: "Review",
    focus: "Review progress",
  },
];
test("unequal phase lengths align to the same forecast domain without midnight overlap", () => {
  const projected = phaseTimeline(
    phases,
    timelineTime("2026-10-29"),
    timelineTime("2026-11-26"),
  );
  assert.equal(projected[0].start, timelineTime("2026-10-29"));
  assert.equal(projected[0].end, projected[1].start);
  assert.equal(projected[1].end, projected[2].start);
  assert.ok(Math.abs(projected[2].left + projected[2].width - 100) < 1e-10);
  assert.ok(projected[1].width > projected[0].width);
  assert.ok(projected[0].width > projected[2].width);
});
test("clipping retains real dates, omits off-chart phases and handles a single-point forecast", () => {
  const before = JSON.stringify(phases);
  const projected = phaseTimeline(
    phases,
    timelineTime("2026-11-12"),
    timelineTime("2026-11-24"),
  );
  assert.deepEqual(
    projected.map((p) => p.number),
    [2, 3],
  );
  assert.equal(projected[0].left, 0);
  assert.equal(projected[0].startsOn, "2026-11-09");
  assert.ok(Math.abs(projected[1].left + projected[1].width - 100) < 1e-10);
  assert.deepEqual(phaseTimeline(phases, 1, 1), []);
  assert.equal(JSON.stringify(phases), before);
});
test("a week crossing a phase boundary stays discoverable in both stages without rewriting the plan", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  const draft = h.state.journey.drafts.at(-1)!;
  draft.content.phases = [
    {
      startsOn: "2026-06-01",
      endsOn: "2026-06-03",
      label: "Start",
      focus: "Start",
    },
    {
      startsOn: "2026-06-04",
      endsOn: draft.binding.endsOn,
      label: "Hold",
      focus: "Hold",
    },
  ];
  const before = JSON.stringify(h.state);
  const projection = selectMeasurementExperience(h.state, "2026-06-04");
  assert.ok(projection.phases[0].weekStarts.includes("2026-06-01"));
  assert.ok(projection.phases[1].weekStarts.includes("2026-06-01"));
  assert.equal(projection.phases[1].current, true);
  assert.equal(JSON.stringify(h.state), before);
});
