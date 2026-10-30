// ABOUTME: Feedback workflow revisions must not masquerade as changed user facts.
// ABOUTME: Proposed dates remain unaccepted intent; actual capacity/initial goal changes still invalidate calculations.
import assert from "node:assert/strict";
import test from "node:test";
import {
  pendingDraft,
  recordFeedback,
} from "../src/application/journey-commands";
import { addDays } from "../src/domain/facts";
import type { JourneyFeedback } from "../src/domain/journey";
import {
  FIXTURE_DATE,
  fictionalInput,
  journeyHarness,
} from "./support/journey-fixtures";

async function prepared(accepted: boolean) {
  const h = journeyHarness();
  await h.controller.start(fictionalInput());
  if (accepted) {
    await h.controller.accept();
    await h.controller.proposeRevision(null, {
      priorities: ["fewer_actions"],
      availableTrainingMinutes: null,
      requestedGoalDate: null,
      notes: "Fictional request for fewer commitments.",
    });
  }
  return h;
}

function feedback(
  h: Awaited<ReturnType<typeof prepared>>,
  changes: Partial<JourneyFeedback> = {},
): JourneyFeedback {
  const draft = pendingDraft(h.state)!;
  return {
    draftId: draft.id,
    sourceRevision: draft.binding.sourceRevision,
    priorities: ["fewer_actions"],
    availableTrainingMinutes: null,
    requestedGoalDate: null,
    notes: "Fictional request to keep one practical focus.",
    ...changes,
  };
}

test("pure replacement feedback retains fact versions, accepted content and numerical history", async () => {
  const h = await prepared(true);
  const before = h.state;
  for (const capacity of [null, before.preferences.availableTrainingMinutes]) {
    const next = recordFeedback(
      before,
      feedback(h, { availableTrainingMinutes: capacity }),
      FIXTURE_DATE,
    );
    assert.equal(next.sourceRevision, before.sourceRevision);
    assert.deepEqual(next.snapshot, before.snapshot);
    assert.deepEqual(next.previousSnapshot, before.previousSnapshot);
    assert.deepEqual(next.assumptionHistory, before.assumptionHistory);
    assert.deepEqual(next.journey.acceptances, before.journey.acceptances);
    assert.deepEqual(next.weeklyPlans, before.weeklyPlans);
    assert.equal(
      next.journey.feedback.length,
      before.journey.feedback.length + 1,
    );
    assert.equal(next.journey.calculation, null);
    assert.equal(next.journey.task, null);
  }
});

test("a replacement's requested date is workflow intent until acceptance", async () => {
  const h = await prepared(true);
  const before = h.state;
  const requestedGoalDate = addDays(before.goal.requestedDate!, 14);
  const next = recordFeedback(
    before,
    feedback(h, { requestedGoalDate }),
    FIXTURE_DATE,
  );
  assert.equal(next.sourceRevision, before.sourceRevision);
  assert.deepEqual(next.goal, before.goal);
  assert.deepEqual(next.targetRevisions, before.targetRevisions);
  assert.deepEqual(next.journey.revisionRequest, {
    targetDate: requestedGoalDate,
    mode: "loss",
  });
});

test("changed capacity or an initial goal date still advances the fact version", async () => {
  const accepted = await prepared(true);
  const updatedCapacity =
    accepted.state.preferences.availableTrainingMinutes + 15;
  const capacity = recordFeedback(
    accepted.state,
    feedback(accepted, { availableTrainingMinutes: updatedCapacity }),
    FIXTURE_DATE,
  );
  assert.equal(capacity.sourceRevision, accepted.state.sourceRevision + 1);
  assert.equal(capacity.preferences.availableTrainingMinutes, updatedCapacity);
  assert.deepEqual(capacity.snapshot, accepted.state.snapshot);

  const initial = await prepared(false);
  const requestedGoalDate = addDays(initial.state.goal.requestedDate!, 14);
  const date = recordFeedback(
    initial.state,
    feedback(initial, { requestedGoalDate }),
    FIXTURE_DATE,
  );
  assert.equal(date.sourceRevision, initial.state.sourceRevision + 1);
  assert.equal(date.goal.requestedDate, requestedGoalDate);
});
