// ABOUTME: Validate calendar output against the exact request before anything reaches the browser.
// ABOUTME: This boundary enforces dates and identities, leaving all existing arrangements user-owned.
import {
  addDays,
  fourWeekStarts,
  weekDates,
  type CoachRequest,
  type PlanPresentation,
} from "../domain/contracts";
export function presentationIssues(
  value: PlanPresentation,
  request: CoachRequest,
  canPlan: boolean,
  asOf: string,
): string[] {
  if (!canPlan)
    return value.newWeeks.length || value.actionChanges.length
      ? [
          "No weight-loss actions or changes may be issued while numerical planning is withheld.",
        ]
      : [];
  const issues: string[] = [];
  const expected = (request.action === "explain" ? [] : fourWeekStarts(asOf))
    .filter(
      (date) => !request.weeklyPlans.some((week) => week.weekStart === date),
    )
    .sort();
  if (
    JSON.stringify(value.newWeeks.map((week) => week.weekStart).sort()) !==
    JSON.stringify(expected)
  )
    issues.push(
      `Generate exactly these missing weeks: ${expected.join(", ") || "none"}. Do not replace existing weeks.`,
    );
  for (const week of value.newWeeks)
    if (week.actions.some((action) => action.dates.some((date) => date < asOf)))
      issues.push("Do not fabricate actions before the as-of date.");
  for (const week of value.newWeeks) {
    const foodDates = new Set(
      week.actions
        .filter((action) => action.kind === "nutrition")
        .flatMap((action) => action.dates),
    );
    const missing = weekDates(week.weekStart).filter(
      (date) => date >= asOf && !foodDates.has(date),
    );
    if (missing.length)
      issues.push(
        `The food routine in ${week.weekStart} is missing these exact dates: ${missing.join(", ")}. Copy remainingDates from forecast.requiredCalendarWeeks; use multiple dates on one action.`,
      );
  }
  const touched = new Set<string>();
  for (const change of value.actionChanges) {
    const week = request.weeklyPlans.find(
      (item) => item.weekStart === change.weekStart,
    );
    if (!week) {
      issues.push("Changes must refer to an existing week.");
      continue;
    }
    if (
      change.replacement?.dates.some(
        (date) =>
          date < asOf ||
          date < week.weekStart ||
          date > addDays(week.weekStart, 6),
      )
    )
      issues.push(
        "Replacement dates must be unelapsed dates inside the specified week.",
      );
    if (change.kind !== "add") {
      const action = week.actions.find((item) => item.id === change.actionId);
      if (!action) {
        issues.push("Changes must identify a real existing action ID.");
        continue;
      }
      if (touched.has(action.id))
        issues.push("Propose at most one change per existing action.");
      touched.add(action.id);
      const protectedDates = action.dates.filter(
        (date) =>
          date < asOf || action.checks.some((check) => check.date === date),
      );
      if (protectedDates.length === action.dates.length)
        issues.push("Past or checked actions cannot be changed by the Agent.");
      if (
        change.replacement?.dates.some((date) => protectedDates.includes(date))
      )
        issues.push(
          "Do not overwrite checked occurrences. Only propose remaining dates.",
        );
    }
  }
  return [...new Set(issues)];
}
