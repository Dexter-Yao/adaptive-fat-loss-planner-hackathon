// ABOUTME: Dated target/review regression adapted to the v4 input and raw-forecast contract.
// ABOUTME: Preserves original policy scenarios; the approved removal of weight offsets changes their assertion.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CoachRequestSchema,
  addDays,
  upsertDailyObservation,
  targetOnDate,
  type CoachRequest,
} from "../src/domain/contracts";
import { endpoint, modelResult } from "../src/domain/forecast";
import { exampleRequest } from "../src/domain/example";
import { hallForecast } from "../src/planning/hall";
import { estimateBaseline } from "../src/planning/inputs";
import {
  calculateForecast,
  evaluatePlanning,
  REVIEW_POLICY,
} from "../src/planning/evaluate";
import { requestAt, observation } from "./support/fixtures";
const approximately = (a: number, b: number, tolerance = 1e-8) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} vs ${b}`);
function diary(
  r: CoachRequest,
  days: number[],
  intake: number | null,
  residual = 0,
) {
  const b = estimateBaseline(r.profile);
  const points = hallForecast({
    ...r.profile,
    pal: b.pal,
    bodyFatPct: b.bodyFatPct,
    initialTdeeKcal: b.tdeeKcal,
    days: Math.max(1, ...days),
    intakeKcal: intake ?? r.targetRevisions[0].dailyCalories,
    intakeTiming: "whole-day",
  });
  return days.map((day) =>
    observation(addDays(r.profile.startDate, day), {
      weightKg: points[day].weightKg + residual,
      intake: intake === null ? null : { mode: "daily_total", kcal: intake },
    }),
  );
}
const current = (r: CoachRequest) => modelResult(calculateForecast(r)).current;

test("correcting a dated entry replaces it and preserves the recorded measurement, without reanchoring", () => {
  const r = exampleRequest("2026-10-28"),
    count = r.logs.length;
  const original = current(r);
  r.logs = upsertDailyObservation(r.logs, {
    ...r.logs.at(-1)!,
    weightKg: 71.6,
  });
  assert.equal(r.logs.length, count);
  assert.equal(calculateForecast(r).weightErrors.at(-1)!.actualKg, 71.6);
  assert.deepEqual(current(r), original);
});

test("the same model replayed from dated inputs has no artificial reinitialization drift", () => {
  const r = requestAt(21),
    days = 84;
  const intake = Array.from({ length: days }, (_, day) =>
    day <= 21 ? 1850 + [0, 100, -75][day % 3] : 1850,
  );
  const b = estimateBaseline(r.profile),
    expected = hallForecast({
      ...r.profile,
      pal: b.pal,
      bodyFatPct: b.bodyFatPct,
      initialTdeeKcal: b.tdeeKcal,
      days,
      intakeKcal: intake,
      intakeTiming: "whole-day",
    });
  r.logs = expected.slice(0, 22).map((p, day) =>
    observation(addDays(r.profile.startDate, day), {
      weightKg: p.weightKg,
      intake: { mode: "daily_total", kcal: intake[day] },
    }),
  );
  const f = calculateForecast(r);
  for (const p of modelResult(f).accepted)
    approximately(
      p.weightKg,
      expected.find((q) => addDays(r.profile.startDate, q.day) === p.date)!
        .weightKg,
    );
  assert.equal(f.baselineDate, r.profile.startDate);
});

test("weight observations never shift raw curves, regardless of observation coverage", () => {
  const r = requestAt();
  r.logs = diary(r, [9, 11], 1850, 0.6);
  const sparse = calculateForecast(r);
  r.logs.push(...diary(r, [14], 1850, 0.6));
  const observed = calculateForecast(r);
  assert.deepEqual(modelResult(observed).current, modelResult(sparse).current);
  assert.deepEqual(observed.baseline, sparse.baseline);
  assert.equal(observed.weightErrors.length, 3);
  assert.match(observed.assumptions.join(" "), /never reinitialize/);
});

test("missing calories remain assumptions, and sparse records still produce a labelled current-condition scenario", () => {
  const r = requestAt();
  r.logs = diary(r, [10, 12, 14], null);
  r.logs[0].intake = { mode: "daily_total", kcal: 1900 };
  r.logs[1].intake = { mode: "daily_total", kcal: 2000 };
  const f = calculateForecast(r);
  assert.equal(f.coverage.recordedDays, 2);
  assert.equal(f.coverage.missingMeals, 15);
  assert.ok(modelResult(f).current.length);
  assert.equal(r.logs[2].intake, null);
});

test("scenario branches share all historical and today states before future forcing diverges", () => {
  const r = requestAt();
  r.logs = diary(r, [10, 12, 14], 2250);
  const f = calculateForecast(r),
    m = modelResult(f);
  for (let i = 0; i <= 15; i++)
    approximately(m.accepted[i].weightKg, m.current[i].weightKg);
  assert.notEqual(m.accepted[16].weightKg, m.current[16].weightKg);
});

test("small measurement noise cannot move an accepted target or trigger a review", () => {
  const r = requestAt();
  r.logs = diary(r, [9, 11, 14], 1850, 0.3);
  const x = evaluatePlanning(r);
  assert.equal(x.decision.code, "holding");
  assert.equal(x.decision.proposal, null);
  assert.deepEqual(x.targetRevisions, r.targetRevisions);
});

test("persistent deviation needs sufficient observations in both non-overlapping windows", () => {
  const r = requestAt();
  r.logs = Array.from({ length: 15 }, (_, i) =>
    observation(addDays(r.profile.startDate, i), {
      intake: { mode: "daily_total", kcal: 1850 },
    }),
  );
  for (const log of diary(r, [1, 3, 8, 11, 14], 1850, 0.8))
    r.logs = upsertDailyObservation(r.logs, log);
  assert.equal(evaluatePlanning(r).decision.code, "holding");
  r.logs = upsertDailyObservation(r.logs, diary(r, [6], 1850, 0.8)[0]);
  const x = evaluatePlanning(r);
  assert.equal(x.decision.code, "persistent_deviation");
  assert.equal(x.decision.proposal!.kind, "extend_timeline");
  assert.equal(x.decision.proposal!.dailyCalories, 1850);
  assert.deepEqual(x.targetRevisions, r.targetRevisions);
});

test("an execution review requires five complete high-intake days, not imputed meals", () => {
  const r = requestAt();
  r.logs = diary(r, [8, 10, 12, 14], 2250);
  assert.equal(evaluatePlanning(r).decision.code, "holding");
  r.logs.push(...diary(r, [13], 2250));
  assert.equal(evaluatePlanning(r).decision.code, "holding");
  r.logs.push(...diary(r, [9], 2250));
  const x = evaluatePlanning(r);
  assert.equal(x.decision.code, "execution_gap");
  assert.equal(x.decision.proposal!.dailyCalories, 1850);
});

test("initial infeasibility and an elapsed deadline warrant review without tightening intake", () => {
  const r = requestAt(0);
  r.action = "create";
  r.goal.requestedDate = addDays(r.profile.startDate, 14);
  r.targetRevisions = [];
  const x = evaluatePlanning(r);
  assert.equal(x.decision.code, "goal_gap");
  assert.equal(
    x.decision.proposal!.dailyCalories,
    x.targetRevisions[0].dailyCalories,
  );
  assert.equal(
    evaluatePlanning({
      ...r,
      targetRevisions: x.targetRevisions,
      action: "update",
    }).decision.proposal!.id,
    x.decision.proposal!.id,
  );
  const expired = evaluatePlanning(requestAt(85));
  assert.equal(expired.decision.code, "timeline_ended");
  assert.equal(expired.decision.proposal!.dailyCalories, 1850);
});

test("an expired accepted date is retained with a separate forward analysis date", () => {
  const r = requestAt(85),
    x = evaluatePlanning(r),
    f = x.forecast!;
  assert.equal(f.targetDate, r.targetRevisions[0].targetDate);
  assert.ok(f.projectionDate > r.asOfDate!);
  assert.equal(modelResult(f).current.at(-1)!.date, f.projectionDate);
  assert.deepEqual(x.targetRevisions, r.targetRevisions);
});

test("only accepting a current proposal appends a tomorrow revision and reproduces its exact preview", () => {
  const r = requestAt();
  r.logs = diary(
    r,
    Array.from({ length: 15 }, (_, i) => i),
    2250,
  );
  const x = evaluatePlanning(r),
    proposal = x.decision.proposal!;
  assert.equal(x.decision.code, "execution_gap");
  assert.throws(
    () =>
      evaluatePlanning({ ...r, action: "accept", acceptProposalId: "stale" }),
    /no longer current/,
  );
  const accepted = evaluatePlanning({
    ...r,
    action: "accept",
    acceptProposalId: proposal.id,
  });
  assert.equal(accepted.targetRevisions.length, 2);
  assert.deepEqual(accepted.targetRevisions[0], r.targetRevisions[0]);
  assert.equal(
    accepted.targetRevisions[1].effectiveFrom,
    addDays(r.asOfDate!, 1),
  );
  approximately(
    endpoint(accepted.forecast!, "accepted")!.weightKg,
    proposal.projectedWeightKg,
  );
  assert.equal(accepted.decision.code, "pending_revision");
  assert.equal(accepted.decision.proposal, null);
  const refresh = evaluatePlanning({
    ...r,
    targetRevisions: accepted.targetRevisions,
  });
  assert.deepEqual(refresh.targetRevisions, accepted.targetRevisions);
  assert.throws(
    () =>
      evaluatePlanning({
        ...r,
        targetRevisions: accepted.targetRevisions,
        action: "accept",
        acceptProposalId: proposal.id,
      }),
    /no longer current/,
  );
});

test("effective target dates preserve historical model states and change only from tomorrow", () => {
  const r = requestAt(),
    original = calculateForecast(r);
  r.targetRevisions.push({
    effectiveFrom: addDays(r.asOfDate!, 1),
    dailyCalories: 2150,
    targetDate: addDays(r.goal.requestedDate!, 14),
    mode: "loss",
    goalId: r.goal.id,
  });
  const f = calculateForecast(r);
  assert.equal(
    targetOnDate(r.targetRevisions, r.asOfDate!)!.dailyCalories,
    1850,
  );
  assert.deepEqual(
    modelResult(f).accepted.slice(0, 16),
    modelResult(original).accepted.slice(0, 16),
  );
  assert.equal(
    targetOnDate(r.targetRevisions, addDays(r.asOfDate!, 1))!.dailyCalories,
    2150,
  );
});

test("ordinary reviews respect cooldown while source-backed safety signals take priority", () => {
  const r = requestAt();
  r.preferences.context = "I am hungry and cannot sustain this plan.";
  r.targetRevisions.push({
    ...r.targetRevisions[0],
    effectiveFrom: addDays(r.profile.startDate, 10),
    targetDate: addDays(r.goal.requestedDate!, 14),
  });
  assert.equal(evaluatePlanning(r).decision.code, "holding");
  assert.equal(
    evaluatePlanning({
      ...r,
      asOfDate: addDays(r.profile.startDate, 10 + REVIEW_POLICY.cooldownDays),
    }).decision.code,
    "feasibility",
  );
  r.logs = [observation(r.asOfDate!, { notes: "I fainted this morning." })];
  const x = evaluatePlanning(r);
  assert.equal(x.forecast, null);
  assert.equal(x.decision.status, "needs_confirmation");
  assert.deepEqual(x.targetRevisions, r.targetRevisions);
});

test("goal attainment withholds loss advice through accepted maintenance transition", () => {
  const r = requestAt(84);
  r.logs = [68.3, 68.2, 68].map((weightKg, i) =>
    observation(addDays(r.profile.startDate, 82 + i), {
      weightKg,
      intake: { mode: "daily_total", kcal: 1850 },
    }),
  );
  const reached = evaluatePlanning(r);
  assert.equal(reached.forecast, null);
  assert.equal(reached.decision.code, "goal_reached");
  assert.equal(reached.decision.proposal!.kind, "maintenance");
  const accepted = evaluatePlanning({
    ...r,
    action: "accept",
    acceptProposalId: reached.decision.proposal!.id,
  });
  assert.equal(accepted.forecast, null);
  assert.equal(accepted.decision.code, "pending_revision");
  assert.match(accepted.decision.summary, /loss targets remain withheld/i);
  assert.deepEqual(accepted.targetRevisions[0], r.targetRevisions[0]);
  const tomorrow = evaluatePlanning({
    ...r,
    targetRevisions: accepted.targetRevisions,
    asOfDate: addDays(r.asOfDate!, 1),
  });
  assert.equal(tomorrow.decision.status, "maintenance");
  assert.equal(
    tomorrow.targetRevisions.at(-1)!.dailyCalories,
    reached.decision.proposal!.dailyCalories,
  );
});

test("sudden goal-reaching measurements require confirmation before a proposal", () => {
  const r = requestAt();
  r.logs = [
    observation(addDays(r.asOfDate!, -1), { weightKg: 72 }),
    observation(r.asOfDate!, { weightKg: 67.8 }),
  ];
  const x = evaluatePlanning(r);
  assert.equal(x.decision.code, "measurement_jump");
  assert.equal(x.forecast, null);
  assert.equal(x.decision.proposal, null);
});

test("zero or very low complete intake stays recorded for confirmation; partial and missing are not zero", () => {
  const r = requestAt();
  for (const kcal of [0, 700]) {
    const log = observation(r.asOfDate!, {
        intake: { mode: "daily_total", kcal },
      }),
      x = evaluatePlanning({ ...r, logs: [log] });
    assert.equal(x.decision.code, "low_intake");
    assert.equal(log.intake!.mode, "daily_total");
    assert.equal(x.forecast, null);
  }
  assert.ok(
    evaluatePlanning({ ...r, logs: [observation(r.asOfDate!)] }).forecast,
  );
});

test("unsupported scope, duplicate/future records and invalid accepted targets fail safely", () => {
  const r = requestAt();
  assert.equal(
    evaluatePlanning({
      ...r,
      profile: { ...r.profile, eligibility: "pregnant_or_breastfeeding" },
    }).forecast,
    null,
  );
  assert.equal(
    evaluatePlanning({
      ...r,
      targetRevisions: [{ ...r.targetRevisions[0], dailyCalories: 1100 }],
    }).decision.code,
    "plan_bounds",
  );
  assert.equal(
    CoachRequestSchema.safeParse({
      ...r,
      logs: [...diary(r, [14], 1850), ...diary(r, [14], 1850)],
    }).success,
    false,
  );
  assert.equal(
    CoachRequestSchema.safeParse({ ...r, logs: diary(r, [15], 1850) }).success,
    false,
  );
});

test("the 365-day horizon cannot be extended to an identical or later unsupported deadline", () => {
  const r = requestAt();
  r.profile.startDate = "2025-01-01";
  r.goal.requestedDate = addDays(r.profile.startDate, 84);
  r.preferences.mealSchedules[0].effectiveFrom = r.profile.startDate;
  r.targetRevisions[0].effectiveFrom = r.profile.startDate;
  r.targetRevisions[0].targetDate = r.goal.requestedDate;
  r.asOfDate = addDays(r.profile.startDate, 330);
  r.preferences.context = "I cannot sustain this plan.";
  r.targetRevisions.push({
    ...r.targetRevisions[0],
    effectiveFrom: addDays(r.profile.startDate, 300),
    targetDate: addDays(r.profile.startDate, 365),
  });
  const x = evaluatePlanning(r);
  assert.equal(modelResult(x.forecast!).current.length, 366);
  assert.equal(x.decision.proposal, null);
  assert.equal(
    CoachRequestSchema.safeParse({
      ...r,
      targetRevisions: [
        r.targetRevisions[0],
        {
          ...r.targetRevisions[1],
          targetDate: addDays(r.profile.startDate, 366),
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    evaluatePlanning({ ...r, asOfDate: addDays(r.profile.startDate, 331) })
      .decision.code,
    "model_horizon",
  );
});

test("a physiology estimate below supported calorie bounds returns an explicit unsupported result", () => {
  const r = requestAt();
  r.targetRevisions = [];
  r.profile = {
    ...r.profile,
    // Stay inside the new age scope so this still exercises the independent calorie-floor guard.
    ageYears: 64,
    heightCm: 130,
    weightKg: 40,
    bodyFat: null,
    activity: {
      ...r.profile.activity,
      work: "very_light",
      leisure: "very_light",
      routines: [],
    },
  };
  r.goal.value = 39;
  assert.throws(() => calculateForecast(r), /calorie-planning bounds/);
});

test("an extended analysis endpoint cannot turn an expired accepted deadline into an on-time success", () => {
  const r = requestAt(85);
  r.goal.value = 71.5;
  const f = calculateForecast(r);
  assert.ok(endpoint(f, "accepted")!.weightKg < r.goal.value);
  assert.ok(f.projectionDate > f.targetDate);
  assert.deepEqual(f.goalOutcomes, { accepted: false, current: false });
  assert.equal(evaluatePlanning(r).decision.code, "timeline_ended");
});
