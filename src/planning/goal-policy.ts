// ABOUTME: Shared product tolerance for projected goal attainment and arrival-date comparisons.
// ABOUTME: This numerical planning tolerance is not a medical measurement-accuracy claim.
import type { GoalSpec } from "../domain/facts";
export const GOAL_TOLERANCE = 0.2;
export function pointMeetsGoal(
  point: { weightKg: number; bodyFatPct: number | null } | undefined,
  goal: GoalSpec,
): boolean {
  return Boolean(
    point &&
      (goal.kind === "weight"
        ? point.weightKg <= goal.value + GOAL_TOLERANCE
        : point.bodyFatPct !== null &&
          point.bodyFatPct <= goal.value + GOAL_TOLERANCE),
  );
}
