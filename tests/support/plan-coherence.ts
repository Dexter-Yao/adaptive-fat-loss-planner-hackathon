// ABOUTME: Explicit synthetic long-plan payloads for coherence regression tests only.
// ABOUTME: Never used by the application, live runner or provider fallback.
import type { JourneyContent } from "../../src/domain/journey";
import { syntheticGuidanceContent } from "./journey-agent";

export function alignSyntheticPractices(content: JourneyContent) {
  const action = content.weeks[0].actions[0];
  for (const phase of content.phases) {
    phase.guidance!.commitments = [action.details];
    phase.guidance!.obstacles = [
      {
        barrier: "If the usual option is unavailable.",
        alternative: action.fallback,
      },
    ];
  }
  return content;
}

export function syntheticStrategy(content: JourneyContent) {
  const { weeks: _weeks, ...outline } = syntheticGuidanceContent(content);
  const action = content.weeks[0].actions[0];
  return {
    ...outline,
    finalWeekFocus: content.weeks.at(-1)!.focus,
    finalCheckInLabel: content.weeks.at(-1)!.checkIn.label,
    practices: [
      {
        id: "p1" as const,
        kind: action.kind,
        title: action.title,
        details: action.details,
        barrier: "If the usual option is unavailable.",
        fallback: action.fallback,
        successCheck: action.successCheck,
      },
    ],
    phases: outline.phases.map((phase) => {
      const {
        commitments: _commitments,
        obstacles: _obstacles,
        ...guidance
      } = phase.guidance!;
      return {
        ...phase,
        weeklyFocus: content.weeks[0].focus,
        weeklyCheckInLabel: content.weeks[0].checkIn.label,
        guidance: { ...guidance, practiceIds: ["p1"] },
      };
    }),
  };
}

export function syntheticReferencedWeeks(weeks: JourneyContent["weeks"]) {
  return weeks.map((week) => ({
    actions: week.actions.map((action) => ({
      practiceId: "p1" as const,
      activityOptionIds:
        action.kind === "movement"
          ? [`m${action.plannedMinutes}x${action.dates.length}`]
          : [],
    })),
  }));
}
