// ABOUTME: One calculator-owned feasibility projection for interface copy, generation and independent judging.
// ABOUTME: Shared goal tolerance stays unchanged; no targets, physiology or generated translations are owned here.
import type { GoalSpec } from "../domain/facts";
import type { StageRequest } from "../domain/workflow";
import { pointMeetsGoal } from "./goal-policy";

export const CALCULATOR_CONTEXT_VERSION = "calculator-context-2026-10-29-v1";
export const UNMET_GOAL_NOTICE =
  "Under the proposed inputs, the calculator does not project reaching your goal by this plan's end date.";

/** Reuse the canonical goal tolerance; missing or mismatched endpoints are unknown, never a negative outcome. */
export function journeyFeasibility(
  calculation: Pick<
    NonNullable<StageRequest["calculation"]>,
    "models" | "targetDate"
  >,
  goal: GoalSpec,
) {
  const hall = calculation.models.find((m) => m.id === "hall");
  const point = hall?.status === "ok" ? hall.endpoint : null;
  const available = Boolean(
    point &&
      point.date === calculation.targetDate &&
      (goal.kind === "weight" || point.bodyFatPct !== null),
  );
  const goalReachedAtHorizon = available ? pointMeetsGoal(point!, goal) : null;
  return {
    version: CALCULATOR_CONTEXT_VERSION,
    authority: "hall" as const,
    comparisonDate: calculation.targetDate,
    goalReachedAtHorizon,
    unavailableReason: available
      ? null
      : "The checked Hall endpoint for this goal measure and horizon is unavailable.",
    requiredNotice: goalReachedAtHorizon === false ? UNMET_GOAL_NOTICE : null,
    meaning:
      "Conditional projected attainment under the existing goal policy, not measured success, adherence or a guarantee. Do not recalculate this boolean from rounded display values.",
  };
}
