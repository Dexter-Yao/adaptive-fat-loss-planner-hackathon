// ABOUTME: Read-only projections shared by all screens; they never persist a second set of facts.
// ABOUTME: Freshness, effective targets and action occurrences are derived, not independently editable state.
import {
  fourWeekStarts,
  dateInZone,
  targetOnDate,
  type WeeklyAction,
} from "../domain/contracts";
import { actionAdviceIssues } from "../domain/context";
import { guidanceContextReviewed } from "./check-in-freshness";
import type { Session } from "./session";
import { mealBudgets } from "../planning/inputs";
export function localToday(zone?: string): string {
  if (zone) return dateInZone(zone);
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function formatDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
): string {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    ...options,
    timeZone: "UTC",
  });
}
export function analysisFresh(s: Session, today: string): boolean {
  return Boolean(
    s.snapshot &&
      s.snapshot.sourceRevision === s.sourceRevision &&
      s.snapshot.asOfDate === today,
  );
}
export function planningPaused(s: Session): boolean {
  return Boolean(
    s.snapshot &&
      (s.snapshot.decision.status === "paused" ||
        s.snapshot.decision.status === "needs_confirmation" ||
        s.snapshot.forecast === null),
  );
}
export function adviceUsable(s: Session, today: string): boolean {
  return (
    analysisFresh(s, today) && !planningPaused(s) && guidanceContextReviewed(s)
  );
}
export function effectiveTarget(s: Session, date: string, today: string) {
  const snapshot = s.snapshot,
    target = targetOnDate(s.targetRevisions, date);
  if (
    !snapshot ||
    snapshot.sourceRevision !== s.sourceRevision ||
    !target ||
    snapshot.decision.status === "paused" ||
    snapshot.decision.status === "needs_confirmation"
  )
    return null;
  if (
    !snapshot.forecast &&
    !(target.mode === "maintenance" && target.effectiveFrom <= today)
  )
    return null;
  return target;
}
export function remainingWeeks(s: Session, today: string): string[] {
  return fourWeekStarts(today).filter(
    (date) => !s.weeklyPlans.some((week) => week.weekStart === date),
  );
}
export function dayActions(
  s: Session,
  weekStart: string,
  date: string,
): WeeklyAction[] {
  return (
    s.weeklyPlans
      .find((week) => week.weekStart === weekStart)
      ?.actions.filter((action) => action.dates.includes(date)) ?? []
  );
}
export function latestWeight(s: Session): { date: string; weightKg: number } {
  const record = [...s.logs].reverse().find((log) => log.weightKg !== null);
  return record
    ? { date: record.date, weightKg: record.weightKg! }
    : { date: s.profile.startDate, weightKg: s.profile.weightKg };
}

export function actionNeedsReview(s: Session, action: WeeklyAction): boolean {
  return Boolean(
    s.pendingActionChanges?.changes.some(
      (change) => change.actionId === action.id,
    ) ||
      (s.snapshot && actionAdviceIssues(action, s.snapshot.context).length),
  );
}

export function proteinReference(s: Session): number {
  return Math.round((latestWeight(s).weightKg * 1.6) / 5) * 5;
}
export function goalLabel(s: Session): string {
  return `${s.goal.value.toFixed(1)} ${s.goal.kind === "weight" ? "kg" : "% body fat"}`;
}

export function mealBudgetForDate(s: Session, date: string) {
  const target = targetOnDate(s.targetRevisions, date);
  return target ? mealBudgets(s.preferences, date, target.dailyCalories) : [];
}
