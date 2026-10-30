// ABOUTME: Replacement feedback must not manufacture a fact revision or withhold the unchanged accepted plan.
// ABOUTME: Real calculator/storage bindings distinguish workflow choices from capacity facts, stale dates and scope blocks.
import assert from "node:assert/strict";
import test from "node:test";
import { selectJourney } from "../src/application/journey-selectors";
import {
  buildCalculationRequest,
  newBinding,
} from "../src/application/journey-commands";
import { loadSession } from "../src/application/persistence";
import { calculateJourney } from "../src/planning/journey-calculation";
import { addDays } from "../src/domain/facts";
import type { StageRequest } from "../src/domain/workflow";
import {
  journeyHarness,
  fictionalInput,
  fictionalStage,
  FIXTURE_DATE,
} from "./support/journey-fixtures";

const intent = {
  priorities: ["fewer_actions" as const],
  availableTrainingMinutes: null,
  requestedGoalDate: null,
  notes: "Fictional feedback: retain just one flexible action.",
};
async function accepted() {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  return h;
}
for (const capacity of ["unspecified", "unchanged"] as const) {
  test(`${capacity} capacity with guidance-only feedback keeps the accepted snapshot and targets in force`, async () => {
    const h = await accepted(),
      before = structuredClone(h.state);
    await h.controller.proposeRevision(null, {
      ...intent,
      availableTrainingMinutes:
        capacity === "unchanged"
          ? h.state.preferences.availableTrainingMinutes
          : null,
    });
    assert.equal(h.state.sourceRevision, before.sourceRevision);
    assert.deepEqual(h.state.preferences, before.preferences);
    assert.deepEqual(h.state.snapshot, before.snapshot);
    assert.deepEqual(h.state.targetRevisions, before.targetRevisions);
    assert.deepEqual(h.state.journey.acceptances, before.journey.acceptances);
    assert.deepEqual(h.state.weeklyPlans, before.weeklyPlans);
    const view = selectJourney(h.state, FIXTURE_DATE);
    assert.equal(view.progress.guidanceWithheld, false);
    assert.equal(view.plan!.adviceFresh, true);
    assert.ok(view.proposal?.canAccept);
    assert.deepEqual(loadSession(h.storage).session, h.state);
    await h.controller.dismissProposal();
    assert.equal(
      selectJourney(h.state, FIXTURE_DATE).progress.guidanceWithheld,
      false,
    );
    assert.deepEqual(h.state.journey.acceptances, before.journey.acceptances);
  });
}
test("a proposed date is workflow input only, not an accepted target or an ordinary calculation revision", async () => {
  const h = await accepted(),
    before = structuredClone(h.state);
  const revision = {
    targetDate: addDays(h.state.targetRevisions[0].targetDate, 7),
    mode: "loss" as const,
  };
  await h.controller.proposeRevision(revision, intent);
  assert.equal(h.state.sourceRevision, before.sourceRevision);
  assert.deepEqual(
    buildCalculationRequest(h.state, newBinding(h.state, FIXTURE_DATE), true)
      .revision,
    revision,
  );
  assert.equal(
    buildCalculationRequest(h.state, newBinding(h.state, FIXTURE_DATE), false)
      .revision,
    null,
  );
  assert.deepEqual(h.state.snapshot, before.snapshot);
  assert.deepEqual(h.state.targetRevisions, before.targetRevisions);
  assert.equal(
    selectJourney(h.state, FIXTURE_DATE).progress.guidanceWithheld,
    false,
  );
});
test("failed guidance generation preserves usable accepted guidance and a reversible failed task", async () => {
  const h = await accepted(),
    before = structuredClone(h.state);
  h.ports.stage = async () => {
    throw Error("Fictional stage unavailable");
  };
  await assert.rejects(
    h.controller.proposeRevision(null, intent),
    /unavailable/,
  );
  assert.equal(h.state.journey.task?.status, "failed");
  assert.equal(
    selectJourney(h.state, FIXTURE_DATE).progress.guidanceWithheld,
    false,
  );
  assert.deepEqual(h.state.snapshot, before.snapshot);
  await h.controller.dismissProposal();
  assert.deepEqual(h.state.journey.acceptances, before.journey.acceptances);
  assert.equal(
    selectJourney(h.state, FIXTURE_DATE).progress.guidanceWithheld,
    false,
  );
});
test("an actual capacity change invalidates the fact binding and never accepts a replacement", async () => {
  const h = await accepted(),
    before = structuredClone(h.state);
  const capacity = h.state.preferences.availableTrainingMinutes === 0 ? 30 : 0;
  await h.controller.proposeRevision(null, {
    ...intent,
    availableTrainingMinutes: capacity,
  });
  assert.equal(h.state.sourceRevision, before.sourceRevision + 1);
  assert.equal(h.state.preferences.availableTrainingMinutes, capacity);
  assert.equal(h.state.snapshot!.sourceRevision, before.sourceRevision);
  assert.equal(
    selectJourney(h.state, FIXTURE_DATE).progress.guidanceWithheld,
    true,
  );
  assert.deepEqual(h.state.targetRevisions, before.targetRevisions);
  await h.controller.dismissProposal();
  assert.equal(h.state.snapshot!.sourceRevision, h.state.sourceRevision);
  assert.equal(h.state.preferences.availableTrainingMinutes, capacity);
  assert.equal(selectJourney(h.state, FIXTURE_DATE).plan!.adviceFresh, false);
});
test("planning cannot stamp a failed measurement refresh or a prior-day snapshot current", async () => {
  for (const changed of ["measurement", "date"] as const) {
    const h = await accepted();
    if (changed === "measurement") {
      h.ports.calculate = async () => {
        throw Error("Fictional refresh unavailable");
      };
      await assert.rejects(
        h.controller.updateMeasurement({
          date: FIXTURE_DATE,
          weightKg: h.state.profile.weightKg + 0.1,
          bodyFat: null,
          notes: "",
        }),
      );
      h.ports.calculate = async (r) => calculateJourney(r);
    } else h.setToday(addDays(FIXTURE_DATE, 1));
    const before = structuredClone(h.state.snapshot);
    const today = changed === "date" ? addDays(FIXTURE_DATE, 1) : FIXTURE_DATE;
    await h.controller.proposeRevision(null, intent);
    assert.deepEqual(h.state.snapshot, before);
    assert.equal(selectJourney(h.state, today).progress.guidanceWithheld, true);
    assert.deepEqual(loadSession(h.storage).session, h.state);
  }
});
test("guidance-only feedback cannot bypass a reported safety block or an elapsed accepted date", async () => {
  const h = await accepted();
  await h.controller.updateMeasurement({
    date: FIXTURE_DATE,
    weightKg: null,
    bodyFat: null,
    notes: "I am pregnant.",
  });
  const blocked = structuredClone(h.state.snapshot);
  await h.controller.proposeRevision(null, intent);
  assert.deepEqual(h.state.snapshot, blocked);
  assert.equal(
    selectJourney(h.state, FIXTURE_DATE).progress.guidanceWithheld,
    true,
  );
  const elapsed = await accepted();
  const date = addDays(elapsed.state.targetRevisions[0].targetDate, 1);
  elapsed.setToday(date);
  await assert.rejects(
    elapsed.controller.proposeRevision(null, intent),
    /elapsed/,
  );
  assert.equal(
    selectJourney(elapsed.state, date).progress.guidanceWithheld,
    true,
  );
});
test("request identity still rejects a cancelled same-facts reply before another replacement completes", async () => {
  const h = await accepted(),
    before = structuredClone(h.state);
  const requests: StageRequest[] = [],
    finish: (() => void)[] = [];
  let observed: (() => void) | undefined;
  h.ports.stage = async (r) => {
    requests.push(r);
    observed?.();
    await new Promise<void>((resolve) => finish.push(resolve));
    return fictionalStage(r);
  };
  let next = new Promise<void>((resolve) => (observed = resolve));
  const first = h.controller.proposeRevision(null, intent);
  const rejected = assert.rejects(first, /abort|cancel/i);
  await next;
  next = new Promise<void>((resolve) => (observed = resolve));
  const second = h.controller.proposeRevision(null, {
    ...intent,
    notes: "Fictional second feedback.",
  });
  await next;
  await rejected;
  assert.notEqual(requests[0].binding.requestId, requests[1].binding.requestId);
  assert.equal(
    requests[0].binding.sourceRevision,
    requests[1].binding.sourceRevision,
  );
  finish[1]();
  await second;
  const candidate = h.state.journey.candidateDraftId;
  finish[0]();
  await Promise.resolve();
  assert.equal(h.state.journey.candidateDraftId, candidate);
  assert.deepEqual(h.state.journey.acceptances, before.journey.acceptances);
  assert.equal(
    selectJourney(h.state, FIXTURE_DATE).progress.guidanceWithheld,
    false,
  );
});
