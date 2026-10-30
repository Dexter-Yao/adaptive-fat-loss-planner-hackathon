// ABOUTME: Pure chart presentation projection from existing model points; never recalculates physiology.
// ABOUTME: Bounds are ordered per point because lower intake does not mean a lower band label in every model.
import type {
  DailyObservation,
  ForecastSnapshot,
  ModelId,
  ModelPoint,
  ProfileFacts,
} from "../domain/contracts";
import { modelResult } from "../domain/forecast";
import { timelineTime } from "../application/journey-timeline";
import { addDays, startOfWeek } from "../domain/facts";
import { forecastMean } from "../application/forecast-comparison";
import { dateRangeLabel } from "./labels";
export interface ForecastChartRow {
  date: string;
  time: number;
  recorded?: number;
  hall?: number;
  thomas?: number;
  antonetti?: number;
  range?: [number, number];
  reference?: number;
  mean?: number;
}
/** Recharts may pass the series label instead of an x value; the row is authoritative. */
export function chartDateLabel(
  value: unknown,
  rowDate?: unknown,
  includeYear = false,
): string {
  const candidate = typeof rowDate === "string" ? rowDate : value;
  const date =
    typeof candidate === "number"
      ? new Date(candidate)
      : typeof candidate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(candidate)
        ? new Date(candidate + "T12:00:00Z")
        : typeof candidate === "string" && /^\d{10,}$/.test(candidate)
          ? new Date(Number(candidate))
          : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        ...(includeYear ? { year: "numeric" as const } : {}),
        timeZone: "UTC",
      })
    : "Forecast date";
}

export function chartPeriodLabel(startsOn: string, endsOn: string): string {
  return dateRangeLabel(startsOn, endsOn);
}
export function chartProjection(
  forecast: ForecastSnapshot | null,
  logs: readonly DailyObservation[],
  metric: "weight" | "body_fat",
  scenario: "current" | "accepted",
  models: ModelId[],
  goalValue?: number,
  profile?: Pick<ProfileFacts, "startDate" | "weightKg" | "bodyFat">,
  reference?: ForecastSnapshot,
  options: {
    period?: { startsOn: string; endsOn: string };
    showMeasurements?: boolean;
    showRange?: boolean;
    includeMean?: boolean;
  } = {},
) {
  const period = options.period;
  const value = (p: ModelPoint) =>
    metric === "weight" ? p.weightKg : p.bodyFatPct;
  const supported = models.filter((id) => {
    const r = forecast?.modelResults.find((m) => m.id === id);
    return r?.status === "ok" && (metric === "weight" || r.composition);
  });
  const byDate = new Map<string, ForecastChartRow>();
  const row = (date: string) => {
    let r = byDate.get(date);
    if (!r) {
      r = { date, time: timelineTime(date) };
      byDate.set(date, r);
    }
    return r;
  };
  for (const id of supported)
    for (const point of modelResult(forecast!, id)[scenario]) {
      const v = value(point);
      if (v !== null) row(point.date)[id] = v;
    }
  const mean = options.includeMean
    ? forecastMean(forecast, metric, scenario, models)
    : { models: [], points: [] };
  for (const point of mean.points) row(point.date).mean = point.value;
  const primary = supported[0] ? modelResult(forecast!, supported[0]) : null;
  const rangeAvailable =
    !!primary &&
    models.length === 1 &&
    scenario === "current" &&
    (forecast?.coverage.totalMissingMeals ?? 0) > 0 &&
    primary.sensitivity.lower.length > 0 &&
    primary.sensitivity.upper.length > 0;
  const hasRange = rangeAvailable && options.showRange !== false;
  if (hasRange && primary) {
    const upper = new Map(primary.sensitivity.upper.map((p) => [p.date, p]));
    for (const lower of primary.sensitivity.lower) {
      const other = upper.get(lower.date),
        a = value(lower),
        b = other ? value(other) : null;
      if (a !== null && b !== null)
        row(lower.date).range = [Math.min(a, b), Math.max(a, b)];
    }
  }
  if (profile && options.showMeasurements !== false) {
    const initial =
      metric === "weight" ? profile.weightKg : profile.bodyFat?.percent;
    if (initial != null) row(profile.startDate).recorded = initial;
  }
  for (const log of options.showMeasurements === false ? [] : logs) {
    const v = metric === "weight" ? log.weightKg : log.bodyFat?.percent;
    if (v != null) row(log.date).recorded = v;
  }
  if (reference) {
    const original = modelResult(reference, "hall");
    if (original.status === "ok")
      for (const point of original.current) {
        const v = value(point);
        if (v !== null) row(point.date).reference = v;
      }
  }
  const outsideMeasurementDates = [...byDate.values()]
    .filter(
      (r) =>
        period &&
        (r.date < period.startsOn || r.date > period.endsOn) &&
        r.recorded != null,
    )
    .map((r) => r.date);
  const rows = [...byDate.values()]
      .filter(
        (r) =>
          !period || (r.date >= period.startsOn && r.date <= period.endsOn),
      )
      .sort((a, b) => a.time - b.time),
    values = rows.flatMap((r) =>
      [
        ...supported.map((id) => r[id]),
        r.recorded,
        r.reference,
        r.mean,
        ...(r.range ?? []),
      ].filter((v): v is number => v != null),
    );
  if (goalValue !== undefined) values.push(goalValue);
  return {
    rows,
    outsideMeasurementDates,
    supported,
    meanModels: mean.models,
    hasRange,
    rangeAvailable,
    min: values.length ? Math.floor(Math.min(...values) - 0.5) : 0,
    max: values.length ? Math.ceil(Math.max(...values) + 0.5) : 1,
  };
}

/** Weekly labels include the partial first week; check-in dates still come only from the accepted plan. */
export function journeyWeekTicks(
  startsOn: string,
  endsOn: string,
  weekStarts: readonly string[] = [],
) {
  if (endsOn < startsOn) return [];
  const anchors = new Set([startsOn]);
  // Weekly plans use Monday boundaries. Keep labels in earlier history too, even if
  // the active revision has no check-in there. These labels never create check-ins.
  for (
    let date = addDays(startOfWeek(startsOn), 7);
    date <= endsOn;
    date = addDays(date, 7)
  )
    anchors.add(date);
  for (const date of weekStarts)
    if (date > startsOn && date <= endsOn) anchors.add(date);
  const ticks = [...anchors].sort().map((date, index) => ({
    date,
    time: timelineTime(date),
    week: index + 1,
    endpoint: date === endsOn,
    kind: "week" as "week" | "end",
  }));
  if (ticks.at(-1)!.date !== endsOn)
    ticks.push({
      date: endsOn,
      time: timelineTime(endsOn),
      week: ticks.at(-1)!.week,
      endpoint: true,
      kind: "end",
    });
  return ticks;
}

/** Thin axis labels to their displayed spacing, preserving both endpoints and every underlying data point. */
export function fitJourneyTicks<T extends { time: number }>(
  ticks: readonly T[],
  plotWidth: number,
  minimumGap: number,
): readonly T[] {
  if (ticks.length <= 2 || plotWidth <= 0 || minimumGap <= 0) return ticks;
  const first = ticks[0],
    last = ticks.at(-1)!;
  const span = last.time - first.time;
  if (span <= 0) return ticks;
  const distance = (a: T, b: T) => ((b.time - a.time) / span) * plotWidth;
  const visible = [first];
  for (const tick of ticks.slice(1, -1))
    if (
      distance(visible.at(-1)!, tick) >= minimumGap &&
      distance(tick, last) >= minimumGap
    )
      visible.push(tick);
  return [...visible, last];
}
export const CHART_MODEL_IDS: readonly ModelId[] = [
  "hall",
  "thomas",
  "antonetti",
];
export function chartModelStates(
  forecast: ForecastSnapshot | null,
  metric: "weight" | "body_fat",
) {
  return CHART_MODEL_IDS.map((id) => {
    const model = forecast?.modelResults.find((m) => m.id === id);
    if (metric === "body_fat" && id === "antonetti")
      return {
        id,
        status: "unsupported" as const,
        message: "Weight only; body-fat prediction is not supported.",
      };
    if (!model)
      return {
        id,
        status: "unavailable" as const,
        message: "No current model result is available.",
      };
    if (model.status === "failed")
      return {
        id,
        status: "failed" as const,
        message: model?.error ?? "No current model result is available.",
      };
    if (
      !model["current"].some((p) => metric === "weight" || p.bodyFatPct != null)
    )
      return {
        id,
        status: "unavailable" as const,
        message: "No output for this measure is available.",
      };
    return { id, status: "available" as const, message: "Current prediction" };
  });
}
