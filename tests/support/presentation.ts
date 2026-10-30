// ABOUTME: Fictional presentation fixtures for protocol tests; never a runtime substitute for model output.
import {
  fourWeekStarts,
  weekDates,
  type CoachExplanation,
  type PlanPresentation,
  type CoachRequest,
} from "../../src/domain/contracts";
export const explanation: CoachExplanation = {
  headline: "A practical week",
  summary: "Keep meals straightforward around lunch out.",
  changes: [],
  question: null,
  whyForecast:
    "The calculation uses the original baseline and dated records. Missing past intake uses accepted targets; the recorded-intake line is a conditional scenario.",
};
export function presentationFor(
  request: Pick<CoachRequest, "asOfDate" | "weeklyPlans">,
  text: CoachExplanation = explanation,
): PlanPresentation {
  const today = request.asOfDate ?? "2026-10-28";
  return {
    explanation: text,
    newWeeks: fourWeekStarts(today)
      .filter(
        (start) =>
          !request.weeklyPlans.some((week) => week.weekStart === start),
      )
      .map((weekStart) => ({
        weekStart,
        focus: "Choose a reliable bought lunch.",
        actions: [
          {
            kind: "nutrition",
            title: "Choose chicken or tofu with vegetables",
            details: "Keep lunch practical when eating out.",
            dates: weekDates(weekStart).filter((date) => date >= today),
          },
        ],
      })),
    actionChanges: [],
  };
}
