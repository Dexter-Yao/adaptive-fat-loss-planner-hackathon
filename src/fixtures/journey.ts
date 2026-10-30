// ABOUTME: Explicit fictional input and model-stage content for isolated B/C previews and tests.
// ABOUTME: Never import this module as an inference fallback or save it over a personal session.
import { estimateBaseline } from "../planning/inputs";
import { addDays, startOfWeek } from "../domain/facts";
import { makeExample } from "../domain/example";
import type { StageRequest, StageResponse } from "../domain/workflow";
export const FIXTURE_DATE = "2026-06-01";
export function fictionalInput() {
  const x = makeExample(addDays(FIXTURE_DATE, 14));
  return {
    profile: { ...x.profile, timezone: "UTC" },
    goal: x.goal,
    preferences: x.preferences,
  };
}
export function fictionalStage(request: StageRequest): StageResponse {
  const { binding, stage, profile } = request;
  if (stage === "interpret")
    return {
      binding,
      stage,
      result: {
        baseline: estimateBaseline(profile),
        interpretation: {
          work: profile.activity.work,
          leisure: profile.activity.leisure,
          rationale: [
            {
              sourceId: "work",
              quote: profile.activity.work,
              explanation: "Fictional fixture preserving the explicit choice.",
            },
          ],
          clarification: null,
        },
        aiStatus: "completed",
        message: null,
        promptVersion: "fictional-test-double",
      },
    };
  if (stage === "review_progress")
    return {
      binding,
      stage,
      result: {
        interpretation: "insufficient_evidence",
        recommendation: "remeasure",
        summary: "Check another measurement before changing the plan.",
        evidence: [
          {
            sourceId: "preferences",
            quote: request.sources.preferences,
            reason: "Keep the practical food restriction.",
          },
        ],
        uncertainty: "A single reading does not establish its cause.",
        question: null,
        proposedChangeSummary: null,
      },
    };
  const start = binding.asOfDate,
    end = request.calculation!.targetDate!,
    weeks = [];
  for (let week = startOfWeek(start); week <= end; week = addDays(week, 7)) {
    const first = week < start ? start : week,
      last = addDays(week, 6) > end ? end : addDays(week, 6);
    weeks.push({
      weekStart: week,
      focus: "Choose a convenient meal before work becomes busy.",
      checkIn: { date: last, label: "Your weekly check-in" },
      actions: [
        {
          key: "lunch-" + week,
          kind: "nutrition" as const,
          title: "Choose a bought lunch before the queue",
          details:
            "At the lunch shop, choose chicken or tofu with rice and vegetables.",
          dates: [first],
          fallback: "Use a familiar supermarket meal when the shop is closed.",
          successCheck: "You selected an available lunch before ordering.",
          plannedMinutes: null,
        },
      ],
    });
  }
  return {
    binding,
    stage,
    result: {
      headline: "Fictional plan for bought lunches",
      summary: "Practice a repeatable lunch choice and check progress weekly.",
      whyForYou: [
        {
          sourceId: "preferences",
          quote: request.sources.preferences,
          reason: "Keep meals available and avoid the excluded food.",
        },
      ],
      phases: [
        {
          label: "A workable routine",
          startsOn: start,
          endsOn: end,
          focus: "Repeat the practical meal choice without increasing demands.",
        },
      ],
      weeks,
      reviewApproach:
        "Update measurements during weekly check-ins and review meaningful changes.",
    },
  };
}
