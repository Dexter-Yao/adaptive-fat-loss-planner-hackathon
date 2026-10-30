// ABOUTME: Stable, bounded future weight illustrations, deliberately separate from all forecast/measurement data.
// ABOUTME: The amplitude is a display assumption, not an individualized physiological range or confidence band.
import { timelineTime } from "./journey-timeline";
import type { ComparisonPoint } from "./forecast-comparison";
export const DAILY_VARIATION_POLICY = {
  version: "illustrative-am-pm-v1",
  minimumHalfRange: 0.002,
  maximumHalfRange: 0.005,
} as const;
export interface DailyVariationPoint {
  date: string;
  time: number;
  period: "morning" | "evening";
  illustration: number;
  trend: number;
}
function sample(seed: string): number {
  let hash = 2166136261;
  for (const char of seed)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}
export function dailyVariation(
  trend: readonly ComparisonPoint[],
  startsOn: string,
  endsOn: string,
  asOfDate: string,
  seed: string,
): DailyVariationPoint[] {
  const first = timelineTime(startsOn),
    last = timelineTime(endsOn);
  return trend.flatMap((point) => {
    if (
      point.date < asOfDate ||
      !Number.isFinite(point.value) ||
      point.value <= 0
    )
      return [];
    const fraction =
      DAILY_VARIATION_POLICY.minimumHalfRange +
      sample(`${DAILY_VARIATION_POLICY.version}:${seed}:${point.date}`) *
        (DAILY_VARIATION_POLICY.maximumHalfRange -
          DAILY_VARIATION_POLICY.minimumHalfRange);
    return (["morning", "evening"] as const).flatMap((period) => {
      const sign = period === "morning" ? -1 : 1;
      const time = timelineTime(point.date) + sign * 21600000;
      // Subday positions are diagram coordinates within the labelled date, not measured local timestamps.
      if (time < first || time > last) return [];
      return [
        {
          date: point.date,
          time,
          period,
          illustration: point.value * (1 + sign * fraction),
          trend: point.value,
        },
      ];
    });
  });
}
