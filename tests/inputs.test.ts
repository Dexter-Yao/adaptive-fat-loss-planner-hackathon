// ABOUTME: Meal provenance, causal activity windows and explicit assumption revisions.
// ABOUTME: Tests distinguish factual zeros, missing inputs and future plans without interpreting prose as calories.
import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays,
  mealSlots,
  IntakeRecordSchema,
  CoachRequestSchema,
  ProfileFactsSchema,
  type PlanningPreferences,
} from "../src/domain/contracts";
import { modelResult, endpoint } from "../src/domain/forecast";
import {
  resolveDay,
  resolveTrajectory,
  mealBudgets,
  estimateBaseline,
} from "../src/planning/inputs";
import {
  questionnairePal,
  activityDelta,
  baselineExercise,
  EXERCISES,
} from "../src/planning/activity";
import { calculateForecast, evaluatePlanning } from "../src/planning/evaluate";
import {
  createSession,
  savePreferences,
  saveDailyRecord,
  receiveCoachResult,
  buildCoachRequest,
} from "../src/application/session";
import { enforceContext } from "../src/domain/context";
import { requestAt, observation } from "./support/fixtures";
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} vs ${b}`);

test("meal budgets use dated targets, sum exactly and retain a balanced integer remainder", () => {
  const r = requestAt();
  const budgets = mealBudgets(r.preferences, r.profile.startDate, 1850);
  assert.equal(
    budgets.reduce((a, b) => a + b.budgetKcal, 0),
    1850,
  );
  assert.ok(
    Math.max(...budgets.map((b) => b.budgetKcal)) -
      Math.min(...budgets.map((b) => b.budgetKcal)) <=
      1,
  );
  r.targetRevisions.push({
    ...r.targetRevisions[0],
    effectiveFrom: r.asOfDate!,
    dailyCalories: 2000,
  });
  assert.equal(resolveDay(r, r.asOfDate!, r.asOfDate!).intakeKcal, 2000);
});

test("one missed meal, explicit skipped meal and extra intake have separate provenance", () => {
  const r = requestAt();
  r.logs = [
    observation(addDays(r.asOfDate!, -1), {
      intake: {
        mode: "meals",
        entries: [
          { slotId: "breakfast", status: "recorded", kcal: 500 },
          { slotId: "lunch", status: "skipped" },
        ],
        extrasKcal: 100,
      },
    }),
  ];
  const day = resolveDay(r, r.logs[0].date, r.asOfDate!);
  assert.deepEqual(
    day.meals.map((m) => m.source),
    ["recorded", "skipped", "imputed_plan"],
  );
  assert.equal(day.meals[1].kcal, 0);
  close(day.intakeKcal, 600 + day.meals[2].budgetKcal * 1.2);
  close(day.recordedBudgetShare, 2 / 3);
  assert.equal(r.logs[0].intake?.mode, "meals");
});

test("a complete daily total is not split into invented meals or added to them", () => {
  const r = requestAt();
  r.logs = [
    observation(addDays(r.asOfDate!, -1), {
      intake: { mode: "daily_total", kcal: 2100 },
    }),
  ];
  const d = resolveDay(r, r.logs[0].date, r.asOfDate!);
  assert.equal(d.intakeKcal, 2100);
  assert.deepEqual(d.meals, []);
  assert.equal(d.recordedBudgetShare, 1);
  assert.equal(
    IntakeRecordSchema.safeParse({
      mode: "daily_total",
      kcal: 2100,
      entries: [{ slotId: "lunch", status: "skipped" }],
    }).success,
    false,
  );
});

test("unrecorded entire past days are imputed while today is pending and future is planned", () => {
  const r = requestAt();
  const past = resolveDay(r, addDays(r.asOfDate!, -1), r.asOfDate!),
    today = resolveDay(r, r.asOfDate!, r.asOfDate!);
  assert.equal(past.intakeKcal, 2220);
  assert.equal(past.recordedBudgetShare, 0);
  assert.equal(past.completed, true);
  assert.equal(today.intakeKcal, 1850);
  assert.equal(today.completed, false);
  assert.ok(today.meals.every((m) => m.source === "planned"));
  assert.equal(calculateForecast(r).coverage.completedDays, 7);
});

test("multiplier changes replay all still-missing historical meals, never replace actual records", () => {
  const r = requestAt();
  r.logs = [
    observation(addDays(r.asOfDate!, -9), {
      intake: { mode: "daily_total", kcal: 1900 },
    }),
    observation(addDays(r.asOfDate!, -2), {
      intake: {
        mode: "meals",
        entries: [{ slotId: "lunch", status: "recorded", kcal: 700 }],
        extrasKcal: 0,
      },
    }),
  ];
  const before = structuredClone(r.logs),
    a = calculateForecast(r);
  r.preferences.missingMealMultiplier = 2;
  const b = calculateForecast(r);
  assert.deepEqual(r.logs, before);
  assert.notEqual(a.inputHash, b.inputHash);
  assert.equal(a.resolvedDays[0].intakeKcal, 2220);
  assert.equal(b.resolvedDays[0].intakeKcal, 3700);
  assert.equal(
    b.resolvedDays.find((d) => d.date === r.logs[0].date)!.intakeKcal,
    1900,
  );
  assert.equal(
    b.resolvedDays
      .find((d) => d.date === r.logs[1].date)!
      .meals.find((m) => m.slotId === "lunch")!.kcal,
    700,
  );
  assert.notEqual(endpoint(a)!.weightKg, endpoint(b)!.weightKg);
});

test("new meal patterns are effective-dated and cannot invent breakfast in a historical two-meal day", () => {
  const r = requestAt();
  r.preferences.mealSchedules[0].slots = mealSlots("two");
  r.preferences.mealSchedules.push({
    effectiveFrom: r.asOfDate!,
    slots: mealSlots("snack"),
  });
  assert.equal(
    resolveDay(r, addDays(r.asOfDate!, -1), r.asOfDate!).meals.length,
    2,
  );
  assert.equal(resolveDay(r, r.asOfDate!, r.asOfDate!).meals.length, 4);
  r.logs = [
    observation(addDays(r.asOfDate!, -1), {
      intake: {
        mode: "meals",
        entries: [{ slotId: "breakfast", status: "recorded", kcal: 500 }],
        extrasKcal: 0,
      },
    }),
  ];
  assert.equal(CoachRequestSchema.safeParse(r).success, false);
});

test("the assumption sensitivity range responds to missingness without becoming an accuracy score", () => {
  const r = requestAt();
  const missing = calculateForecast(r),
    m = modelResult(missing);
  assert.notEqual(
    m.sensitivity.lower.at(-1)!.weightKg,
    m.sensitivity.upper.at(-1)!.weightKg,
  );
  r.logs = Array.from({ length: 14 }, (_, i) =>
    observation(addDays(r.profile.startDate, i), {
      intake: { mode: "daily_total", kcal: 1850 },
    }),
  );
  const complete = calculateForecast(r),
    c = modelResult(complete);
  assert.equal(complete.coverage.recordedBudgetShare, 1);
  assert.equal(complete.coverage.totalMissingMeals, 0);
  assert.deepEqual(c.sensitivity.lower, c.sensitivity.upper);
  assert.match(complete.assumptions.join(" "), /not a confidence interval/);
  assert.ok(!("accuracy" in complete.coverage));
});

test("coverage uses recorded budget fractions and whole days, without counting fabricated meals", () => {
  const r = requestAt();
  r.preferences.mealSchedules[0].slots = [
    { id: "lunch", label: "Lunch", share: 0.25 },
    { id: "dinner", label: "Dinner", share: 0.75 },
  ];
  r.logs = [
    observation(addDays(r.asOfDate!, -1), {
      intake: {
        mode: "meals",
        entries: [{ slotId: "lunch", status: "recorded", kcal: 500 }],
        extrasKcal: 0,
      },
    }),
    observation(addDays(r.asOfDate!, -2), {
      intake: { mode: "daily_total", kcal: 1800 },
    }),
  ];
  const f = calculateForecast(r);
  close(f.coverage.recordedBudgetShare, 1.25 / 7);
  assert.equal(f.coverage.recordedDays, 1);
  assert.equal(f.coverage.missingMeals, 11);
});

test("seven completed days use initial priors for an insufficient window and unknown activity is not rest", () => {
  const r = requestAt(2);
  r.profile.activity.routines = [
    { kind: "running", minutes: 60, timesPerWeek: 3 },
  ];
  r.logs = [
    observation(r.profile.startDate, {
      intake: { mode: "daily_total", kcal: 2000 },
      activity: { work: "very_light", exercises: [] },
    }),
  ];
  const d = resolveTrajectory(
    r,
    r.asOfDate!,
    addDays(r.asOfDate!, 3),
    "current",
  );
  const future = d.find((x) => x.date === addDays(r.asOfDate!, 1))!;
  close(future.intakeKcal, (2000 + 2220 + 5 * 1850) / 7);
  close(future.activityDeltaKcalPerKgDay, -baselineExercise(r.profile) / 7);
  assert.equal(
    resolveDay(r, addDays(r.profile.startDate, 1), r.asOfDate!)
      .activityDeltaKcalPerKgDay,
    0,
  );
  assert.equal(
    resolveDay(r, r.profile.startDate, r.asOfDate!).activitySource,
    "recorded",
  );
});

test("three-day smoothing is only an eval comparator and historical inputs are identical", () => {
  const r = requestAt();
  r.logs = Array.from({ length: 14 }, (_, i) =>
    observation(addDays(r.profile.startDate, i), {
      intake: { mode: "daily_total", kcal: i >= 11 ? 2400 : 1800 },
      activity: {
        work: "very_light",
        exercises: i >= 11 ? [{ kind: "walking", minutes: 60 }] : [],
      },
    }),
  );
  const seven = resolveTrajectory(
      r,
      r.asOfDate!,
      addDays(r.asOfDate!, 5),
      "current",
    ),
    three = resolveTrajectory(
      r,
      r.asOfDate!,
      addDays(r.asOfDate!, 5),
      "current",
      1.2,
      3,
    );
  assert.deepEqual(seven.slice(0, 15), three.slice(0, 15));
  assert.notEqual(seven[15].intakeKcal, three[15].intakeKcal);
  assert.notEqual(
    seven[15].activityDeltaKcalPerKgDay,
    three[15].activityDeltaKcalPerKgDay,
  );
});

test("new observations change their date forward, never earlier states; steps add no expenditure", () => {
  const r = requestAt();
  const before = calculateForecast(r);
  r.logs = [
    observation(addDays(r.asOfDate!, -3), {
      intake: { mode: "daily_total", kcal: 2300 },
      activity: {
        work: "very_light",
        exercises: [{ kind: "walking", minutes: 60 }],
      },
      steps: 8000,
    }),
  ];
  const after = calculateForecast(r);
  for (const id of ["hall", "thomas", "antonetti"] as const) {
    const a = modelResult(before, id),
      b = modelResult(after, id);
    assert.deepEqual(a.current.slice(0, 12), b.current.slice(0, 12));
  }
  const next = structuredClone(r);
  next.logs[0].steps = 20000;
  assert.deepEqual(
    modelResult(calculateForecast(next)).current,
    modelResult(after).current,
  );
});

test("PAL uses the fixed NIDDK matrix, future training capacity never increases it", () => {
  assert.equal(questionnairePal("very_light", "very_light"), 1.4);
  assert.equal(questionnairePal("heavy", "very_active"), 2.3);
  const r = requestAt(),
    b = estimateBaseline(r.profile);
  r.preferences.availableTrainingMinutes = 900;
  assert.deepEqual(estimateBaseline(r.profile), b);
  assert.equal(EXERCISES.muay_thai.code, "15430");
  assert.equal(EXERCISES.swimming.code, "18240");
});

test("exercise uses net MET time relative to the initial routine and no separate routine top-up to PAL", () => {
  const r = requestAt();
  r.profile.activity.routines = [
    { kind: "walking", minutes: 60, timesPerWeek: 7 },
  ];
  close(
    activityDelta(r.profile, {
      work: r.profile.activity.work,
      exercises: [{ kind: "walking", minutes: 60 }],
    }),
    0,
  );
  close(
    activityDelta(r.profile, { work: r.profile.activity.work, exercises: [] }),
    -2.8,
  );
  const b = estimateBaseline(r.profile);
  close(b.tdeeKcal, b.rmrKcal * b.pal);
});

test("shared measured body fat overrides the reference estimate and Antonetti remains weight-only", () => {
  const r = requestAt();
  const f = calculateForecast(r);
  assert.equal(f.baseline.bodyFatSource, "user_reported");
  assert.equal(modelResult(f, "hall").current[0].bodyFatPct, 32);
  close(modelResult(f, "thomas").current[0].bodyFatPct!, 32);
  assert.equal(modelResult(f, "antonetti").current[0].bodyFatPct, null);
  r.profile.bodyFat = null;
  assert.equal(
    calculateForecast(r).baseline.bodyFatSource,
    "jackson_reference",
  );
  assert.equal(
    ProfileFactsSchema.safeParse({
      ...r.profile,
      bodyFat: { percent: 0.32, method: "bia" },
    }).success,
    false,
  );
});

test("body-fat goals are planned by Hall with explicit conservative support floors and an optional estimated date", () => {
  const r = requestAt(0);
  r.logs = [];
  r.targetRevisions = [];
  r.goal = { ...r.goal, kind: "body_fat", value: 29, requestedDate: null };
  const x = evaluatePlanning(r);
  assert.ok(x.forecast);
  assert.ok(x.targetRevisions[0].targetDate > r.profile.startDate);
  assert.equal(x.targetRevisions[0].goalId, r.goal.id);
  r.goal.value = 22.9;
  assert.equal(evaluatePlanning(r).decision.code, "goal_range");
  r.profile.sex = "male";
  r.goal.value = 14.9;
  assert.equal(evaluatePlanning(r).decision.code, "goal_range");
});

test("one comparison model may fail transparently while Hall remains the planning authority", () => {
  const r = requestAt();
  r.profile.activity.routines = [
    { kind: "running", minutes: 60, timesPerWeek: 2 },
  ];
  r.logs = [
    observation(addDays(r.asOfDate!, -1), {
      activity: { work: "very_light", exercises: [] },
    }),
  ];
  const f = calculateForecast(r);
  assert.equal(modelResult(f, "hall").status, "ok");
  assert.equal(modelResult(f, "thomas").status, "failed");
  assert.match(modelResult(f, "thomas").error!, /reference activity/);
  assert.equal(modelResult(f, "antonetti").status, "ok");
  assert.equal(modelResult(f, "thomas").current.length, 0);
});

test("settings preserve old assumption snapshots and fact corrections do not overwrite them", () => {
  const r = requestAt();
  let s = createSession(r.profile, r.goal, r.preferences, r.logs, true);
  s.targetRevisions = r.targetRevisions;
  const req = buildCoachRequest(s, r.asOfDate!),
    x = evaluatePlanning(req);
  s = receiveCoachResult(
    s,
    req,
    {
      ...x,
      sessionId: s.id,
      sourceRevision: s.sourceRevision,
      actionsRevision: s.actionsRevision,
      asOfDate: r.asOfDate!,
      context: enforceContext(req),
      explanation: null,
      provider: null,
      model: null,
      toolCalls: [],
      newWeeks: [],
      actionChanges: [],
    },
    r.asOfDate!,
  );
  const old = structuredClone(s.snapshot);
  s = savePreferences(
    s,
    { ...s.preferences, missingMealMultiplier: 2 },
    r.asOfDate!,
  );
  assert.deepEqual(s.assumptionHistory[0].snapshot, old);
  assert.equal(s.assumptionHistory[0].preferences.missingMealMultiplier, 1.2);
  s = saveDailyRecord(
    s,
    observation(r.asOfDate!, { bodyFat: { percent: 31, method: "bia" } }),
    r.asOfDate!,
  );
  assert.deepEqual(s.assumptionHistory[0].snapshot, old);
  assert.equal(s.logs.at(-1)!.bodyFat!.percent, 31);
});

test("preference commands reject historical eating-pattern rewrites even outside the settings UI", () => {
  const r = requestAt(),
    s = createSession(r.profile, r.goal, r.preferences, [], true);
  assert.throws(
    () =>
      savePreferences(
        s,
        {
          ...s.preferences,
          mealSchedules: [
            { effectiveFrom: s.profile.startDate, slots: mealSlots("two") },
          ],
        },
        r.asOfDate!,
      ),
    /Historical eating patterns/,
  );
  const next = savePreferences(
    s,
    {
      ...s.preferences,
      mealSchedules: [
        ...s.preferences.mealSchedules,
        { effectiveFrom: r.asOfDate!, slots: mealSlots("two") },
      ],
    },
    r.asOfDate!,
  );
  assert.equal(next.preferences.mealSchedules.length, 2);
});

test("an empty new meal template is not a factual zero or a completed observation", () => {
  const r = requestAt(),
    s = createSession(r.profile, r.goal, r.preferences, [], true);
  assert.throws(
    () =>
      saveDailyRecord(
        s,
        observation(r.asOfDate!, {
          intake: { mode: "meals", entries: [], extrasKcal: 0 },
        }),
        r.asOfDate!,
      ),
    /Add a measurement/,
  );
});

test("weekend exercise is replayed on its actual dates; only the future is smoothed", () => {
  const r = requestAt();
  r.profile.activity.routines = [];
  r.logs = Array.from({ length: 14 }, (_, i) =>
    observation(addDays(r.profile.startDate, i), {
      intake: { mode: "daily_total", kcal: 1850 },
      activity: {
        work: "very_light",
        exercises: i % 7 >= 5 ? [{ kind: "cycling", minutes: 90 }] : [],
      },
    }),
  );
  const days = resolveTrajectory(
    r,
    r.asOfDate!,
    addDays(r.asOfDate!, 4),
    "current",
  );
  assert.equal(days[4].activityDeltaKcalPerKgDay, 0);
  assert.equal(days[5].activityDeltaKcalPerKgDay, 4.5);
  close(days[15].activityDeltaKcalPerKgDay, 9 / 7);
});
