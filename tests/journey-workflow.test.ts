// ABOUTME: Full A workflow through typed model ports and real calculation with explicitly fictional AI output.
// ABOUTME: Verifies consent, persistence, version races and recovery; it does not evaluate prompting quality.
import assert from "node:assert/strict";
import test from "node:test";
import {
  journeyHarness,
  fictionalInput,
  FIXTURE_DATE,
  fictionalStage,
} from "./support/journey-fixtures";
import { addDays } from "../src/domain/facts";
import {
  pendingDraft,
  buildStageRequest,
  newBinding,
} from "../src/application/journey-commands";
import { selectJourney } from "../src/application/journey-selectors";
import { calculateJourney } from "../src/planning/journey-calculation";
import {
  loadSession,
  SESSION_KEY,
  BACKUP_SESSION_KEY,
} from "../src/application/persistence";
import { JourneyController } from "../src/application/journey-controller";
import { editAction, checkAction } from "../src/application/session";
import type {
  CalculationResponse,
  StageResponse,
} from "../src/domain/workflow";

test("setup → interpretation → calculation → full journey → explicit checked acceptance", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  assert.deepEqual(
    h.calls.map((r) => r.stage),
    ["interpret", "generate"],
  );
  assert.equal(h.state.targetRevisions.length, 0);
  assert.equal(h.state.weeklyPlans.length, 0);
  const d = pendingDraft(h.state)!;
  assert.ok(d.content.weeks.length > 4);
  assert.equal(d.feedbackRevision, 0);
  assert.equal(selectJourney(h.state, FIXTURE_DATE).phase, "review");
  await h.controller.accept();
  assert.equal(selectJourney(h.state, FIXTURE_DATE).phase, "active");
  assert.equal(h.state.journey.acceptances.length, 1);
  assert.ok(h.state.targetRevisions.length);
  assert.equal(h.state.weeklyPlans.length, d.content.weeks.length);
  assert.ok(h.state.weeklyPlans.every((w) => w.checkIn));
  assert.deepEqual(loadSession(h.storage).session, h.state);
});
test("three feedback revisions are allowed; rejecting the third retains feedback and never auto-accepts", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput());
  for (let i = 0; i < 4; i++) {
    const d = pendingDraft(h.state)!;
    await h.controller.feedback({
      draftId: d.id,
      sourceRevision: d.binding.sourceRevision,
      priorities: ["less_time"],
      availableTrainingMinutes: 0,
      requestedGoalDate: null,
      notes: "Fictional feedback: keep lunch simple.",
    });
    if (i < 3) assert.equal(pendingDraft(h.state)!.feedbackRevision, i + 1);
  }
  assert.equal(h.calls.filter((r) => r.stage === "revise").length, 3);
  assert.equal(h.state.journey.feedback.length, 4);
  assert.equal(h.state.targetRevisions.length, 0);
  assert.equal(selectJourney(h.state, FIXTURE_DATE).phase, "feedback_limit");
  await assert.rejects(h.controller.retry(), /three feedback/);
  h.controller.updateSetup(fictionalInput());
  await h.controller.generate();
  assert.equal(pendingDraft(h.state)!.feedbackRevision, 0);
  assert.equal(h.state.journey.feedback.length, 4);
});
test("measurement is saved before a failed forecast, and retry/reopen preserve facts and accepted history", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput());
  await h.controller.accept();
  const reference = JSON.stringify(h.state.journey.acceptances),
    targets = JSON.stringify(h.state.targetRevisions);
  h.setToday(addDays(FIXTURE_DATE, 7));
  h.ports.calculate = async () => {
    assert.equal(loadSession(h.storage).session!.logs[0].weightKg, 71.8);
    throw new Error("Forecast unavailable");
  };
  await assert.rejects(
    h.controller.updateMeasurement({
      date: addDays(FIXTURE_DATE, 7),
      weightKg: 71.8,
      bodyFat: null,
      notes: "After travel",
    }),
    /unavailable/,
  );
  assert.equal(h.state.logs.length, 1);
  assert.equal(JSON.stringify(h.state.targetRevisions), targets);
  assert.equal(JSON.stringify(h.state.journey.acceptances), reference);
  assert.equal(
    selectJourney(h.state, addDays(FIXTURE_DATE, 7)).phase,
    "recovery",
  );
  h.ports.calculate = async (r) => calculateJourney(r);
  await h.controller.retry();
  assert.equal(h.state.snapshot!.asOfDate, addDays(FIXTURE_DATE, 7));
  assert.deepEqual(loadSession(h.storage).session!.logs, h.state.logs);
});
test("measurement-only updates preserve existing intake/activity; notes persist without numerical recalculation", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput());
  await h.controller.accept();
  h.replace({
    ...h.state,
    logs: [
      {
        date: FIXTURE_DATE,
        weightKg: null,
        bodyFat: null,
        notes: "",
        steps: 5000,
        intake: { mode: "daily_total", kcal: 1800 },
        activity: {
          work: "very_light",
          exercises: [{ kind: "walking", minutes: 20 }],
        },
      },
    ],
  });
  await h.controller.updateMeasurement({
    date: FIXTURE_DATE,
    weightKg: 72,
    bodyFat: null,
    notes: "A note",
  });
  assert.deepEqual(h.state.logs[0].intake, { mode: "daily_total", kcal: 1800 });
  assert.equal(h.state.logs[0].activity!.exercises[0].minutes, 20);
  const n = h.calculations.length,
    hash = h.state.snapshot!.forecast!.inputHash;
  await h.controller.updateMeasurement({
    date: FIXTURE_DATE,
    weightKg: 72,
    bodyFat: null,
    notes: "A corrected note",
  });
  assert.equal(h.calculations.length, n);
  assert.equal(h.state.snapshot!.forecast!.inputHash, hash);
  assert.equal(
    loadSession(h.storage).session!.logs[0].notes,
    "A corrected note",
  );
});
test("a meaningful changed prediction invokes one coach review; duplicates never apply or tighten targets", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput());
  await h.controller.accept();
  const targets = structuredClone(h.state.targetRevisions),
    day = addDays(FIXTURE_DATE, 14),
    predicted = h.state.snapshot!.forecast!.modelResults[0].current.find(
      (p) => p.date === day,
    )!.weightKg;
  h.setToday(day);
  await h.controller.updateMeasurement({
    date: day,
    weightKg: predicted + 1.8,
    bodyFat: null,
    notes: "Fictional travel check-in.",
  });
  assert.equal(h.calls.filter((r) => r.stage === "review_progress").length, 1);
  await h.controller.reviewProgress();
  assert.equal(h.calls.filter((r) => r.stage === "review_progress").length, 1);
  assert.deepEqual(h.state.targetRevisions, targets);
  assert.ok(h.state.journey.assessments[0].eligible);
  assert.equal(h.state.journey.reviews[0].result.recommendation, "remeasure");
});
test("storage failure cannot report a saved record or start calculation", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput());
  await h.controller.accept();
  const n = h.calculations.length;
  h.storage.fail = true;
  await assert.rejects(
    h.controller.updateMeasurement({
      date: FIXTURE_DATE,
      weightKg: 72,
      bodyFat: null,
      notes: "",
    }),
    /quota/,
  );
  assert.equal(h.state.logs.length, 0);
  assert.equal(h.calculations.length, n);
});
test("late calculation cannot overwrite newer measurements and an action edit invalidates a pending model result", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput());
  await h.controller.accept();
  let resolve!: (r: CalculationResponse) => void;
  h.ports.calculate = async (r) =>
    new Promise((done) => {
      resolve = () => done(calculateJourney(r));
    });
  const one = h.controller.updateMeasurement({
    date: FIXTURE_DATE,
    weightKg: 71.9,
    bodyFat: null,
    notes: "first",
  });
  const rejected = assert.rejects(one, /late result|changed|abort/i);
  const oldResolve = resolve;
  h.ports.calculate = async (r) => calculateJourney(r);
  await h.controller.updateMeasurement({
    date: FIXTURE_DATE,
    weightKg: 71.8,
    bodyFat: null,
    notes: "second",
  });
  oldResolve(null!);
  await rejected;
  assert.equal(h.state.logs[0].weightKg, 71.8);
  assert.equal(h.state.snapshot!.sourceRevision, h.state.sourceRevision);
  let finish!: (r: StageResponse) => void;
  h.ports.stage = async (r) =>
    new Promise((done) => {
      finish = () => done(fictionalStage(r));
    });
  const review = h.controller.reviewProgress(true),
    week = h.state.weeklyPlans[0],
    action = week.actions[0];
  // Aligning a reference may await WebCrypto; wait until the actual request is recorded.
  while (!finish) await new Promise((done) => setTimeout(done, 0));
  h.replace(
    editAction(
      h.state,
      week.weekStart,
      action.id,
      {
        kind: action.kind,
        details: action.details,
        title: "My changed lunch",
        dates: [FIXTURE_DATE],
      },
      FIXTURE_DATE,
    ),
  );
  finish(null!);
  await assert.rejects(review, /late result|changed/);
  assert.equal(h.state.weeklyPlans[0].actions[0].title, "My changed lunch");
});
test("expired comparison dates align derived references without altering the immutable acceptance", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput());
  await h.controller.accept();
  const reference = JSON.stringify(h.state.journey.acceptances[0].reference);
  h.setToday(addDays(FIXTURE_DATE, 90));
  await h.controller.recalculate();
  await h.controller.reviewProgress(true);
  const request = h.calls.at(-1)!;
  assert.equal(
    request.comparison!.reference.comparisonDate,
    request.comparison!.updated.comparisonDate,
  );
  assert.equal(
    JSON.stringify(h.state.journey.acceptances[0].reference),
    reference,
  );
});
test("migration upgrades v4 without losing data or synthesizing acceptance; pending reopen is recoverable", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput());
  await h.controller.accept();
  const { journey, ...v5 } = h.state;
  const text = JSON.stringify({ ...v5, version: 4 });
  h.storage.setItem(SESSION_KEY, text);
  const restored = loadSession(h.storage).session!;
  assert.equal(restored.version, 6);
  assert.deepEqual(restored.weeklyPlans, h.state.weeklyPlans);
  assert.deepEqual(restored.targetRevisions, h.state.targetRevisions);
  assert.equal(restored.journey.acceptances.length, 0);
  assert.equal(h.storage.getItem(BACKUP_SESSION_KEY), text);
  let finish!: (r: CalculationResponse) => void;
  h.ports.calculate = async (r) =>
    new Promise((done) => {
      finish = () => done(calculateJourney(r));
    });
  h.storage.setItem(SESSION_KEY, JSON.stringify(h.state));
  const pending = h.controller.recalculate();
  const reopened = loadSession(h.storage).session!;
  assert.equal(selectJourney(reopened, FIXTURE_DATE, false).phase, "recovery");
  finish(null!);
  await pending;
});

test("numerical revision stays proposed until rechecked acceptance, starts tomorrow and preserves edited/checked actions", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput());
  await h.controller.accept();
  const originalTargets = structuredClone(h.state.targetRevisions),
    originalReference = JSON.stringify(h.state.journey.acceptances[0]);
  h.replace(
    checkAction(
      h.state,
      h.state.weeklyPlans[0].actions[0].id,
      FIXTURE_DATE,
      "done",
      FIXTURE_DATE,
    ),
  );
  const future = h.state.weeklyPlans[1],
    a = future.actions[0];
  h.replace(
    editAction(
      h.state,
      future.weekStart,
      a.id,
      {
        kind: a.kind,
        title: "My lunch choice",
        details: a.details,
        dates: a.dates,
      },
      FIXTURE_DATE,
    ),
  );
  const kept = structuredClone(h.state.weeklyPlans[0].actions[0]);
  h.setToday(addDays(FIXTURE_DATE, 14));
  await h.controller.proposeRevision({
    targetDate: addDays(originalTargets[0].targetDate, 14),
    mode: "loss",
  });
  assert.deepEqual(h.state.targetRevisions, originalTargets);
  assert.equal(h.state.journey.acceptances.length, 1);
  const candidate = h.state.journey.calculation!.proposedTargets.at(-1)!;
  assert.equal(candidate.effectiveFrom, addDays(FIXTURE_DATE, 15));
  assert.equal(candidate.dailyCalories, originalTargets[0].dailyCalories);
  await h.controller.accept();
  assert.equal(h.state.targetRevisions.length, 2);
  assert.deepEqual(h.state.targetRevisions[0], originalTargets[0]);
  assert.equal(
    JSON.stringify(h.state.journey.acceptances[0]),
    originalReference,
  );
  assert.deepEqual(h.state.weeklyPlans[0].actions[0], kept);
  assert.equal(h.state.weeklyPlans[1].actions[0].title, "My lunch choice");
});
test("zero-innovation updates need no coach, BF-only never fabricates weight and changed devices are explicit", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput());
  await h.controller.accept();
  const day = addDays(FIXTURE_DATE, 7),
    p = h.state.snapshot!.forecast!.modelResults[0].current.find(
      (p) => p.date === day,
    )!;
  h.setToday(day);
  await h.controller.updateMeasurement({
    date: day,
    weightKg: p.weightKg,
    bodyFat: null,
    notes: "",
  });
  assert.equal(h.calls.filter((r) => r.stage === "review_progress").length, 0);
  const date = addDays(FIXTURE_DATE, 14);
  h.setToday(date);
  await h.controller.updateMeasurement({
    date,
    weightKg: null,
    bodyFat: { percent: 31.5, method: "dxa" },
    notes: "Different device",
  });
  assert.equal(h.state.logs.at(-1)!.weightKg, null);
  assert.ok(
    h.state.journey.assessments
      .at(-1)!
      .reasons.includes("measurement_method_changed"),
  );
  const f = h.state.snapshot!.forecast!,
    hall = f.conditioning!.models[0].events.at(-1)!;
  assert.equal(hall.estimatedWeightUsed, true);
  assert.equal(f.modelResults[2].current.at(-1)!.bodyFatPct, null);
});
test("coach failure retains the fresh numerical result and measurement; retry uses the saved input", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput());
  await h.controller.accept();
  const day = addDays(FIXTURE_DATE, 14),
    w = h.state.snapshot!.forecast!.modelResults[0].current.find(
      (p) => p.date === day,
    )!.weightKg;
  h.setToday(day);
  h.ports.stage = async () => {
    throw new Error("Coach unavailable");
  };
  await assert.rejects(
    h.controller.updateMeasurement({
      date: day,
      weightKg: w + 1.8,
      bodyFat: null,
      notes: "Check-in",
    }),
    /Coach unavailable/,
  );
  assert.equal(h.state.snapshot!.sourceRevision, h.state.sourceRevision);
  assert.equal(h.state.logs[0].weightKg, w + 1.8);
  h.ports.stage = async (r) => fictionalStage(r);
  await h.controller.retry();
  assert.equal(h.state.journey.reviews.length, 1);
  assert.equal(h.state.journey.task, null);
});
test("a day rollover invalidates an in-flight draft and only an explicit retry can continue", async () => {
  const h = journeyHarness();
  let finish!: () => void;
  h.ports.stage = async (r) =>
    r.stage === "interpret"
      ? fictionalStage(r)
      : new Promise((done) => {
          finish = () => done(fictionalStage(r));
        });
  const work = h.controller.start(fictionalInput());
  while (!finish) await new Promise((done) => setTimeout(done, 0));
  h.setToday(addDays(FIXTURE_DATE, 1));
  finish();
  await assert.rejects(work, /date.*changed/);
  assert.equal(h.state.journey.drafts.length, 0);
  assert.equal(h.state.targetRevisions.length, 0);
  h.ports.stage = async (r) => fictionalStage(r);
  await h.controller.retry();
  assert.equal(
    pendingDraft(h.state)!.binding.startsOn,
    addDays(FIXTURE_DATE, 1),
  );
});

test("a generic coach review leaves stored practical guidance unreviewed after a new note", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput());
  await h.controller.accept();
  assert.equal(selectJourney(h.state, FIXTURE_DATE).plan!.adviceFresh, true);
  const n = h.calculations.length;
  await h.controller.updateMeasurement({
    date: FIXTURE_DATE,
    weightKg: null,
    bodyFat: null,
    notes: "My lunch break is shorter this week.",
  });
  assert.equal(h.calculations.length, n);
  assert.equal(selectJourney(h.state, FIXTURE_DATE).plan!.adviceFresh, false);
  await h.controller.reviewProgress(true);
  assert.equal(selectJourney(h.state, FIXTURE_DATE).coach!.current, true);
  assert.equal(selectJourney(h.state, FIXTURE_DATE).plan!.adviceFresh, false);
});
test("bounded stage context keeps older active restrictions and explicitly states its record window", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput());
  await h.controller.accept();
  const logs = Array.from({ length: 40 }, (_, i) => ({
    date: addDays(FIXTURE_DATE, i),
    weightKg: null,
    bodyFat: null,
    intake: null,
    activity: null,
    steps: null,
    notes: i === 0 ? "I am allergic to peanuts." : "Fictional neutral note.",
  }));
  h.replace({ ...h.state, logs, sourceRevision: h.state.sourceRevision + 1 });
  h.setToday(addDays(FIXTURE_DATE, 40));
  await h.controller.recalculate();
  const stage = buildStageRequest(
    h.state,
    newBinding(h.state, addDays(FIXTURE_DATE, 40)),
    "review_progress",
  );
  assert.equal(stage.historyCoverage.totalRecords, 40);
  assert.equal(stage.measurements.length, 28);
  assert.ok(
    stage.calculation!.context.constraints.some((c) => c.kind === "allergy"),
  );
  assert.ok(
    stage.sources[`log:${FIXTURE_DATE}`].includes("allergic to peanuts"),
  );
  assert.ok(
    new TextEncoder().encode(JSON.stringify(stage)).byteLength < 1_000_000,
  );
});
