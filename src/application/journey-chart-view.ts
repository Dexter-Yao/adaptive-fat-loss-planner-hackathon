// ABOUTME: B's read-only adapter combines canonical snapshots/check-ins with A's authoritative goal period.
// ABOUTME: It does not infer a goal horizon, recompute forecasts, or treat planned check-ins as observations.
import type { GoalSummaryView } from "./goal-progress-contract";
import type { JourneyChartInput } from "./journey-chart-contract";
import { selectJourney } from "./journey-selectors";
import type { Session } from "./session";
export function selectJourneyChartInput(
  session: Session,
  today: string,
  summary: GoalSummaryView,
): JourneyChartInput | null {
  const view = selectJourney(session, today);
  if (!view.plan || !summary.period || !summary.activePlanPeriod) return null;
  if (
    summary.goal.id !== session.goal.id ||
    summary.goal.kind !== session.goal.kind ||
    summary.goal.value !== session.goal.value ||
    summary.goal.requestedDate !== session.goal.requestedDate ||
    summary.activePlanPeriod.startsOn !== view.plan.startsOn ||
    summary.activePlanPeriod.endsOn !== view.plan.endsOn ||
    summary.period.startsOn > view.plan.startsOn ||
    summary.period.endsOn !== view.plan.endsOn
  ) {
    throw new Error("The chart goal period does not match this accepted plan.");
  }
  const snapshot = view.progress.snapshot;
  return {
    binding: {
      sessionId: session.id,
      sourceRevision: session.sourceRevision,
      acceptedJourneyId: view.plan.id,
      asOfDate: today,
      snapshotSourceRevision: snapshot?.sourceRevision ?? null,
      inputHash: snapshot?.forecast?.inputHash ?? null,
    },
    freshness: !snapshot?.forecast
      ? "unavailable"
      : view.progress.numbersFresh
        ? "current"
        : "stale",
    guidanceWithheld: view.progress.guidanceWithheld,
    profile: session.profile,
    goal: session.goal,
    period: summary.period,
    activePlanPeriod: summary.activePlanPeriod,
    forecast: snapshot?.forecast ?? null,
    reference: view.progress.reference,
    observations: session.logs,
    phases: view.plan.phases.map((phase) => ({
      ...phase,
      current: phase.startsOn <= today && phase.endsOn >= today,
    })),
    checkIns: view.plan.weeks
      .flatMap((week) =>
        week.checkIn
          ? [
              {
                weekStart: week.weekStart,
                date: week.checkIn.date,
                label: week.checkIn.label,
              },
            ]
          : [],
      )
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
