// ABOUTME: Whole-plan revision intent, measurement provenance and common-date presentation regression tests.
// ABOUTME: Fictional stages isolate application invariants; these tests do not evaluate real coaching quality.
import assert from "node:assert/strict";
import test from "node:test";
import { checkedStageSources } from "../src/agent/stage-context";
import { checkedStageCalculation } from "../src/agent/stage-router";
import { selectMeasurementExperience } from "../src/application/measurement-view";
import { loadSession } from "../src/application/persistence";
import { SessionSchema } from "../src/application/session";
import {
  fictionalInput,
  fictionalStage,
  FIXTURE_DATE,
  journeyHarness,
} from "./support/journey-fixtures";

test("manual note-only review refreshes the current calculator binding before the actual Agent boundary", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  const before = structuredClone(h.state);
  const note =
    "Fictional obstacle: my lunch counter closed; a supermarket sells ready-to-eat tofu.";
  await h.controller.updateMeasurement({
    date: FIXTURE_DATE,
    weightKg: null,
    bodyFat: null,
    notes: note,
  });
  assert.equal(h.state.journey.calculation, null);
  assert.equal(h.calls.filter((c) => c.stage === "review_progress").length, 0);
  const calculations = h.calculations.length;
  let reviews = 0;
  h.ports.stage = async (request) => {
    assert.equal(request.stage, "review_progress");
    const checked = checkedStageCalculation(request);
    assert.equal(checked.binding.sourceRevision, h.state.sourceRevision);
    assert.equal(
      checked.binding.acceptedJourneyId,
      h.state.journey.acceptances.at(-1)!.id,
    );
    assert.equal(request.sources[`log:${FIXTURE_DATE}`]!.includes(note), true);
    reviews += 1;
    return fictionalStage(request);
  };
  await h.controller.reviewProgress(true);
  assert.equal(h.calculations.length, calculations + 1);
  assert.equal(reviews, 1);
  assert.equal(h.state.logs[0].weightKg, null);
  assert.equal(h.state.logs[0].bodyFat, null);
  assert.deepEqual(h.state.targetRevisions, before.targetRevisions);
  assert.deepEqual(h.state.journey.acceptances, before.journey.acceptances);
  assert.deepEqual(loadSession(h.storage).session, h.state);
});

test("manual review calculation failure preserves the note and cannot call or acknowledge the model", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  await h.controller.updateMeasurement({
    date: FIXTURE_DATE,
    weightKg: null,
    bodyFat: null,
    notes: "Fictional obstacle for failed refresh",
  });
  h.ports.calculate = async () => {
    throw new Error("Fictional calculation failure");
  };
  h.ports.stage = async () => {
    throw new Error("Model must not run");
  };
  await assert.rejects(
    () => h.controller.reviewProgress(true),
    /Fictional calculation failure/,
  );
  assert.equal(h.state.journey.task?.stage, "calculate");
  assert.equal(h.state.journey.reviews.length, 0);
  assert.equal(
    loadSession(h.storage).session!.logs[0].notes,
    "Fictional obstacle for failed refresh",
  );
});
const intent = {
  priorities: ["food_flexibility" as const],
  availableTrainingMinutes: 0,
  requestedGoalDate: null,
  notes: "I need more flexible bought lunches; I have no kitchen.",
};
async function accepted() {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  return h;
}
test("whole-plan feedback persists, reaches model context and never writes a measurement or accepts itself", async () => {
  const h = await accepted(),
    before = structuredClone(h.state),
    end = h.state.journey.drafts[0].binding.endsOn;
  await h.controller.proposeRevision(null, intent);
  assert.deepEqual(h.state.logs, before.logs);
  assert.deepEqual(h.state.targetRevisions, before.targetRevisions);
  assert.deepEqual(h.state.journey.acceptances, before.journey.acceptances);
  assert.equal(h.state.preferences.availableTrainingMinutes, 0);
  assert.deepEqual(h.calls.at(-1)!.revisionIntent, intent);
  assert.equal(h.calls.at(-1)!.sources.revisionIntent, JSON.stringify(intent));
  assert.deepEqual(
    loadSession(h.storage).session?.journey.revisionIntent,
    intent,
  );
  assert.ok(h.state.journey.candidateDraftId);
  assert.deepEqual(h.state.journey.drafts.at(-1)?.revisionIntent, intent);
});
test("failed inference retains revision intent, active acceptance and persisted facts for retry", async () => {
  const h = await accepted(),
    before = structuredClone(h.state);
  h.ports.stage = async () => {
    throw new Error("offline");
  };
  await assert.rejects(
    () => h.controller.proposeRevision(null, intent),
    /offline/,
  );
  assert.deepEqual(h.state.journey.revisionIntent, intent);
  assert.deepEqual(h.state.logs, before.logs);
  assert.deepEqual(h.state.journey.acceptances, before.journey.acceptances);
  assert.equal(h.state.journey.task?.status, "failed");
  assert.deepEqual(loadSession(h.storage).session, h.state);
});
test("older v5 sessions without intent remain readable and retain their prior plans", async () => {
  const h = await accepted(),
    old = structuredClone(h.state);
  delete old.journey.revisionIntent;
  const restored = SessionSchema.parse(old);
  assert.deepEqual(restored.journey.acceptances, h.state.journey.acceptances);
  assert.deepEqual(restored.logs, h.state.logs);
});
test("canonical revision evidence rejects an alias that disagrees with structured intent", async () => {
  const h = await accepted();
  await h.controller.proposeRevision(null, intent);
  const request = structuredClone(h.calls.at(-1)!);
  request.sources.revisionIntent = "invented";
  assert.throws(() => checkedStageSources(request), /differs/);
});
test("measurement projection compares matching dates and never manufactures body-fat measurements", async () => {
  const h = await accepted(),
    view = selectMeasurementExperience(h.state, FIXTURE_DATE);
  assert.ok(view.endpoint);
  assert.equal(view.difference?.date, view.endpoint?.date);
  assert.equal(view.difference?.weightKg, 0);
  assert.equal(view.weeks.filter((w) => w.current).length, 1);
  assert.equal(view.revisions.length, 1);
  const before = JSON.stringify(h.state);
  selectMeasurementExperience(h.state, FIXTURE_DATE);
  assert.equal(JSON.stringify(h.state), before);
});
test("invalid revision feedback cannot mutate the accepted session", async () => {
  const h = await accepted(),
    before = JSON.stringify(h.state);
  await assert.rejects(() =>
    h.controller.proposeRevision(
      { targetDate: h.state.journey.drafts[0].binding.endsOn, mode: "loss" },
      { ...intent, availableTrainingMinutes: -1 },
    ),
  );
  assert.equal(JSON.stringify(h.state), before);
});

test("discarding a replacement retains accepted history and allows return after the third decline", async () => {
  const h = await accepted(),
    before = structuredClone(h.state.journey.acceptances);
  await h.controller.proposeRevision(null, intent);
  await h.controller.dismissProposal();
  assert.equal(h.state.journey.candidateDraftId, null);
  assert.deepEqual(h.state.journey.acceptances, before);
  assert.equal(h.state.journey.drafts.length, 2);
  assert.ok(h.state.snapshot);
});

// Shared content remains readable both before and after explicit acceptance.
test("strategy copy cannot retain a pending-acceptance instruction after acceptance", async () => {
  const { journeyStatusCopyIssues } = await import(
    "../src/agent/journey-content"
  );
  assert.equal(
    journeyStatusCopyIssues("Targets stay proposals until you accept them.")
      .length,
    1,
  );
  assert.equal(
    journeyStatusCopyIssues(
      "A repeatable bought-lunch routine with a timing review at check-ins.",
    ).length,
    0,
  );
});
