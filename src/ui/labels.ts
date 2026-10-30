// ABOUTME: Shared human-facing labels and dated ranges; no business status or numerical policy is inferred here.
import { formatDate } from "@/application/selectors";

export function dateRangeLabel(startsOn: string, endsOn: string): string {
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    ...(startsOn.slice(0, 4) !== endsOn.slice(0, 4) ? { year: "numeric" } : {}),
  };
  return `${formatDate(startsOn, options)} – ${formatDate(endsOn, options)}`;
}

export const actionLabels = {
  nutrition: "Food",
  movement: "Movement",
  recording: "Check-in",
};

export const coachRecommendationLabels = {
  keep_plan: "Keep your current plan",
  remeasure: "Take another comparable measurement",
  adjust_execution: "Try a more workable approach",
  revise_plan: "Review a possible plan change",
  pause: "Pause and review your situation",
} as const;

export const feedbackPriorities = [
  ["less_time", "Less time commitment"],
  ["fewer_actions", "Fewer things to focus on"],
  ["food_flexibility", "More flexible food choices"],
  ["different_activity", "Different activities"],
  ["later_goal_date", "More time to reach my goal"],
  ["other", "Something else"],
] as const;

export const MODEL_LABELS = {
  hall: "Hall / NIDDK dynamic model",
  thomas: "Thomas / Pennington model",
  antonetti: "Modified Antonetti model",
} as const;
