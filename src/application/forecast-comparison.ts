// ABOUTME: Equal-weight chart comparison on common dates from one snapshot/scenario; no model is refitted.
// ABOUTME: The descriptive mean is not a planning model and never enters target or coach calculations.
import type {
  ForecastSnapshot,
  ModelId,
  ModelPoint,
} from "../domain/contracts";
import type { GoalSpec } from "../domain/facts";
export interface ComparisonPoint {
  date: string;
  value: number;
}
export function forecastMean(
  forecast: ForecastSnapshot | null,
  metric: GoalSpec["kind"],
  scenario: "current" | "accepted",
  allowed: readonly ModelId[],
): { models: ModelId[]; points: ComparisonPoint[] } {
  const seen = new Set<ModelId>();
  const models = (forecast?.modelResults ?? []).filter((model) => {
    if (
      seen.has(model.id) ||
      !allowed.includes(model.id) ||
      model.status !== "ok" ||
      (metric === "body_fat" &&
        (!model.composition || model.id === "antonetti"))
    )
      return false;
    seen.add(model.id);
    return true;
  });
  const value = (point: ModelPoint) =>
    metric === "weight" ? point.weightKg : point.bodyFatPct;
  const usable = models.filter((model) =>
    model[scenario].some((p) => {
      const n = value(p);
      return n != null && Number.isFinite(n);
    }),
  );
  if (!usable.length) return { models: [], points: [] };
  const maps = usable.map(
    (model) => new Map(model[scenario].map((p) => [p.date, value(p)])),
  );
  const points = [...maps[0]]
    .flatMap(([date]) => {
      const values = maps.map((m) => m.get(date));
      if (values.some((n) => n == null || !Number.isFinite(n))) return [];
      return [
        {
          date,
          value:
            (values as number[]).reduce((sum, n) => sum + n, 0) / usable.length,
        },
      ];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return { models: usable.map((model) => model.id), points };
}
