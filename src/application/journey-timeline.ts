// ABOUTME: Date-aligned presentation geometry for accepted journey phases; no forecast or target calculation.
// ABOUTME: Half-open phase boundaries prevent double-counting; all geometry is clipped to the chart domain.
import { addDays } from "../domain/facts";
import type { JourneyContent } from "../domain/journey";
export type JourneyPhase = JourneyContent["phases"][number] & {
  current?: boolean;
};
export const timelineTime = (date: string) => Date.parse(date + "T12:00:00Z");
export function phaseTimeline(
  phases: readonly JourneyPhase[],
  first: number,
  last: number,
) {
  const span = last - first;
  if (span <= 0) return [];
  return phases.flatMap((phase, index) => {
    const start = Math.max(first, timelineTime(phase.startsOn));
    const end = Math.min(last, timelineTime(addDays(phase.endsOn, 1)));
    if (start >= end) return [];
    return [
      {
        ...phase,
        number: index + 1,
        start,
        end,
        left: ((start - first) / span) * 100,
        width: ((end - start) / span) * 100,
      },
    ];
  });
}
