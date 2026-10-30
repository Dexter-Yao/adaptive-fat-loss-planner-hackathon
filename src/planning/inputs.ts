// ABOUTME: Resolve facts and explicit missing-meal assumptions into dated model forcing.
// ABOUTME: These projections never mutate diary entries; future meals are planned, not missing.
import {
  addDays,
  daysBetween,
  targetOnDate,
  type ProfileFacts,
  type PlanningPreferences,
  type DailyObservation,
  type TargetRevision,
} from "../domain/facts";
import type { BaselineEstimate, ResolvedDayInput } from "../domain/forecast";
import { restingEnergy } from "./hall";
import { ACTIVITY_VERSION, baselinePal, activityDelta } from "./activity";
export const INPUT_POLICY_VERSION = "adaptive-inputs-v4-seven-day-1";
export function estimateBaseline(profile: ProfileFacts): BaselineEstimate {
  const pal = baselinePal(profile),
    rmrKcal = restingEnergy(profile);
  const reference =
    0.14 * profile.ageYears +
    (profile.sex === "male" ? 37.31 : 39.96) *
      Math.log(profile.weightKg / (profile.heightCm / 100) ** 2) -
    (profile.sex === "male" ? 103.94 : 102.01);
  const bodyFatPct = profile.bodyFat?.percent ?? reference;
  if (!Number.isFinite(bodyFatPct) || bodyFatPct <= 0 || bodyFatPct >= 65)
    throw new Error("The body-composition estimate needs review.");
  return {
    pal,
    rmrKcal,
    tdeeKcal: rmrKcal * pal,
    bodyFatPct,
    fatMassKg: (profile.weightKg * bodyFatPct) / 100,
    bodyFatSource: profile.bodyFat ? "user_reported" : "jackson_reference",
    activitySource: profile.activity.source,
    activityVersion: ACTIVITY_VERSION,
  };
}
export function scheduleOnDate(preferences: PlanningPreferences, date: string) {
  return (
    [...preferences.mealSchedules]
      .reverse()
      .find((s) => s.effectiveFrom <= date) ?? preferences.mealSchedules[0]
  );
}
export function mealBudgets(
  preferences: PlanningPreferences,
  date: string,
  kcal: number,
) {
  const slots = scheduleOnDate(preferences, date).slots;
  const base = slots.map((s) => ({
    ...s,
    budgetKcal: Math.floor(kcal * s.share),
  }));
  let remaining = Math.round(kcal) - base.reduce((a, b) => a + b.budgetKcal, 0);
  const order = slots
    .map((s, i) => ({
      i,
      remainder: kcal * s.share - Math.floor(kcal * s.share),
    }))
    .sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < remaining; i++)
    base[order[i % order.length].i].budgetKcal++;
  return base;
}
export interface InputContext {
  profile: ProfileFacts;
  preferences: PlanningPreferences;
  logs: DailyObservation[];
  targetRevisions: TargetRevision[];
}
export function resolveDay(
  c: InputContext,
  date: string,
  asOf: string,
  multiplier = c.preferences.missingMealMultiplier,
): ResolvedDayInput {
  const log = c.logs.find((l) => l.date === date),
    target = targetOnDate(c.targetRevisions, date) ?? c.targetRevisions[0],
    completed = date < asOf;
  if (!target)
    throw new Error("A dated target is required to resolve meal budgets.");
  const recordedActivity = log?.activity ?? null;
  const activity = activityDelta(c.profile, recordedActivity);
  if (log?.intake?.mode === "daily_total")
    return {
      date,
      intakeKcal: log.intake.kcal,
      intakeSource: "daily_total",
      meals: [],
      recordedBudgetShare: 1,
      activityDeltaKcalPerKgDay: activity,
      activitySource: recordedActivity ? "recorded" : "baseline",
      completed,
    };
  const record = log?.intake?.mode === "meals" ? log.intake : null;
  const budgets = mealBudgets(c.preferences, date, target.dailyCalories);
  if (record?.entries.some((e) => !budgets.some((b) => b.id === e.slotId)))
    throw new Error(
      "A meal entry does not belong to that date's eating pattern.",
    );
  let covered = 0;
  const meals = budgets.map((b) => {
    const entry = record?.entries.find((e) => e.slotId === b.id);
    if (entry && entry.status !== "unknown") {
      covered += b.share;
      return {
        slotId: b.id,
        label: b.label,
        budgetKcal: b.budgetKcal,
        kcal: entry.status === "skipped" ? 0 : entry.kcal,
        source:
          entry.status === "skipped"
            ? ("skipped" as const)
            : ("recorded" as const),
        multiplier: null,
      };
    }
    return {
      slotId: b.id,
      label: b.label,
      budgetKcal: b.budgetKcal,
      kcal: b.budgetKcal * (completed ? multiplier : 1),
      source: completed ? ("imputed_plan" as const) : ("planned" as const),
      multiplier: completed ? multiplier : null,
    };
  });
  return {
    date,
    intakeKcal:
      meals.reduce((sum, m) => sum + m.kcal, 0) + (record?.extrasKcal ?? 0),
    intakeSource: meals.every((m) => m.source === "imputed_plan")
      ? "imputed_plan"
      : completed
        ? "meals"
        : "planned",
    meals,
    recordedBudgetShare: Math.min(1, covered),
    activityDeltaKcalPerKgDay: activity,
    activitySource: recordedActivity ? "recorded" : "baseline",
    completed,
  };
}
export function resolveTrajectory(
  c: InputContext,
  asOf: string,
  projectionDate: string,
  scenario: "accepted" | "current",
  multiplier = c.preferences.missingMealMultiplier,
  windowDays = 7,
): ResolvedDayInput[] {
  const first = c.targetRevisions[0];
  const completed = Array.from({ length: windowDays }, (_, i) =>
    addDays(asOf, i - windowDays),
  );
  const window = completed.map((date) =>
    date < c.profile.startDate ? null : resolveDay(c, date, asOf, multiplier),
  );
  const meanIntake =
    window.reduce((a, d) => a + (d?.intakeKcal ?? first.dailyCalories), 0) /
    windowDays;
  const meanActivity =
    window.reduce((a, d) => a + (d?.activityDeltaKcalPerKgDay ?? 0), 0) /
    windowDays;
  return Array.from(
    { length: daysBetween(c.profile.startDate, projectionDate) },
    (_, i) => {
      const date = addDays(c.profile.startDate, i),
        day = resolveDay(c, date, asOf, multiplier);
      if (date <= asOf) return day;
      return {
        ...day,
        intakeKcal:
          scenario === "current"
            ? meanIntake
            : (targetOnDate(c.targetRevisions, date) ?? first).dailyCalories,
        intakeSource: scenario === "current" ? "recent_pattern" : "planned",
        meals: [],
        recordedBudgetShare: 0,
        activityDeltaKcalPerKgDay: scenario === "current" ? meanActivity : 0,
        activitySource: scenario === "current" ? "rolling_mean" : "baseline",
        completed: false,
      };
    },
  );
}
