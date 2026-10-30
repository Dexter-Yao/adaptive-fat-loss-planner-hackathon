// ABOUTME: Real controller/persistence tests for review and check-in presentation; provider content is explicitly scripted.
// ABOUTME: These verify user-decision/state boundaries, not usefulness or health outcomes.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  selectAcceptedPlanHistory,
  selectCheckInExperience,
  selectPlanReview,
} from "../src/application/journey-experience-view";
import { loadSession } from "../src/application/persistence";
import {
  replanningSession,
  selectReplanning,
} from "../src/application/replanning";
import { PlanComparison } from "../src/ui/plan-comparison";
import {
  fictionalInput,
  FIXTURE_DATE,
  journeyHarness,
} from "./support/journey-fixtures";

const feedback = {
  priorities: ["food_flexibility" as const],
  availableTrainingMinutes: null,
  requestedGoalDate: null,
  notes:
    "Fictional obstacle: the lunch counter has closed; I need a supermarket fallback.",
};
async function firstPlan() {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  return h;
}

test("initial proposal is not labelled an accepted plan or compared to an invented previous plan", async () => {
  const h = await firstPlan();
  const p = selectPlanReview(h.state, FIXTURE_DATE)!;
  assert.equal(p.previous, null);
  assert.equal(p.replacement, false);
  assert.equal(h.state.journey.acceptances.length, 0);
});

test("rejection compares the exact previous proposal and saved feedback without fabricating accepted targets", async () => {
  const h = await firstPlan();
  const before = structuredClone(h.state.journey.drafts.at(-1)!);
  await h.controller.feedback({
    ...feedback,
    draftId: before.id,
    sourceRevision: h.state.sourceRevision,
  });
  const p = selectPlanReview(h.state, FIXTURE_DATE)!;
  assert.deepEqual(p.previous, before);
  assert.equal(p.feedback?.notes, feedback.notes);
  assert.equal(p.previousLabel, "Previous proposal");
  assert.equal(p.currentTarget, null);
  assert.equal(h.state.journey.acceptances.length, 0);
});

test("replacement review, cancellation and reload preserve the accepted plan and numerical history", async () => {
  const h = await firstPlan();
  await h.controller.accept();
  const before = structuredClone(h.state);
  await h.controller.proposeRevision(null, feedback);
  const p = selectPlanReview(h.state, FIXTURE_DATE)!;
  assert.equal(p.previous?.id, before.journey.acceptances.at(-1)!.draftId);
  assert.equal(p.feedback?.notes, feedback.notes);
  assert.equal(p.replacement, true);
  const html = renderToStaticMarkup(
    createElement(PlanComparison, { review: p }),
  );
  assert.match(html, /Current accepted plan/);
  assert.match(html, /Proposed plan · not accepted/);
  assert.match(html, /What would change/);
  assert.match(html, /Your feedback for this version/);
  assert.deepEqual(h.state.targetRevisions, before.targetRevisions);
  assert.deepEqual(h.state.journey.acceptances, before.journey.acceptances);
  assert.deepEqual(
    selectPlanReview(loadSession(h.storage).session!, FIXTURE_DATE),
    p,
  );
  h.controller.dismissProposal();
  assert.equal(selectPlanReview(h.state, FIXTURE_DATE), null);
  assert.deepEqual(h.state.journey.acceptances, before.journey.acceptances);
});

test("same-day accepted versions identify the current plan only after explicit acceptance and retain that status on reload", async () => {
  const h = await firstPlan();
  await h.controller.accept();
  const originalId = h.state.journey.acceptances.at(-1)!.id;
  await h.controller.proposeRevision(null, feedback);
  assert.equal(
    selectAcceptedPlanHistory(h.state, FIXTURE_DATE)[0].id,
    originalId,
  );
  assert.equal(selectAcceptedPlanHistory(h.state, FIXTURE_DATE).length, 1);
  await h.controller.accept();
  const revisions = selectAcceptedPlanHistory(h.state, FIXTURE_DATE);
  assert.equal(revisions.length, 2);
  assert.equal(revisions[0].isCurrent, true);
  assert.equal(revisions[0].version, 2);
  assert.equal(revisions[1].id, originalId);
  assert.equal(revisions[1].isCurrent, false);
  assert.equal(revisions[1].version, 1);
  assert.equal(revisions[0].acceptedOn, revisions[1].acceptedOn);
  assert.deepEqual(
    selectAcceptedPlanHistory(loadSession(h.storage).session!, FIXTURE_DATE),
    revisions,
  );
});

test("a note-only obstacle is saved but is not presented as a new measurement or completed coach review", async () => {
  const h = await firstPlan();
  await h.controller.accept();
  const model = structuredClone(h.state.snapshot!.forecast);
  await h.controller.updateMeasurement({
    date: FIXTURE_DATE,
    weightKg: null,
    bodyFat: null,
    notes: feedback.notes,
  });
  const v = selectCheckInExperience(h.state, FIXTURE_DATE);
  assert.equal(v.latest!.weightKg, null);
  assert.equal(v.latest!.notes, feedback.notes);
  assert.equal(v.review, null);
  assert.equal(v.numbersFresh, true);
  assert.equal(v.guidanceFresh, false);
  assert.equal(v.canRequestReview, true);
  assert.deepEqual(h.state.snapshot!.forecast, model);
  assert.equal(h.calls.filter((c) => c.stage === "review_progress").length, 0);
  await h.controller.reviewProgress(true);
  assert.ok(selectCheckInExperience(h.state, FIXTURE_DATE).review);
});

test("calculation failure leaves saved measurement, explicit recovery and no current coach conclusion", async () => {
  const h = await firstPlan();
  await h.controller.accept();
  h.ports.calculate = async () => {
    throw new Error("Fictional calculation interruption");
  };
  await assert.rejects(
    () =>
      h.controller.updateMeasurement({
        date: FIXTURE_DATE,
        weightKg: 73.7,
        bodyFat: null,
        notes: "Fictional measurement",
      }),
    /interruption/,
  );
  const restored = loadSession(h.storage).session!;
  const v = selectCheckInExperience(restored, FIXTURE_DATE);
  assert.equal(v.latest!.weightKg, 73.7);
  assert.equal(v.task!.working, false);
  assert.equal(v.numbersFresh, false);
  assert.equal(v.review, null);
  assert.equal(v.canRequestReview, false);
});

test("old or dismissed coaching cannot be presented as this update's conclusion", async () => {
  const h = await firstPlan();
  await h.controller.accept();
  await h.controller.reviewProgress(true);
  assert.ok(selectCheckInExperience(h.state, FIXTURE_DATE).review);
  h.controller.dismissReview();
  assert.equal(selectCheckInExperience(h.state, FIXTURE_DATE).review, null);
  await h.controller.updateMeasurement({
    date: FIXTURE_DATE,
    weightKg: null,
    bodyFat: null,
    notes: feedback.notes,
  });
  assert.equal(selectCheckInExperience(h.state, FIXTURE_DATE).review, null);
});

test("a fresh-goal candidate compares with the retained root plan, without confusing the two cores", async () => {
  const h = await firstPlan();
  await h.controller.accept();
  const acceptedId = h.state.journey.acceptances.at(-1)!.draftId;
  await h.controller.beginReplanning();
  const input = selectReplanning(h.state)!.input;
  input.goal.value = 71;
  await h.controller.updateReplanningSetup(input);
  await h.controller.generateReplanning();
  const candidate = replanningSession(h.state)!;
  const comparison = selectPlanReview(candidate, FIXTURE_DATE, h.state)!;
  assert.equal(comparison.previous!.id, acceptedId);
  assert.equal(comparison.currentGoal!.value, h.state.goal.value);
  assert.equal(comparison.proposedGoal.value, 71);
  assert.equal(comparison.replacement, true);
  assert.equal(candidate.journey.acceptances.length, 0);
  assert.equal(h.state.archives.length, 0);
  assert.equal(
    loadSession(h.storage).session!.journey.acceptances.at(-1)!.draftId,
    acceptedId,
  );
});
