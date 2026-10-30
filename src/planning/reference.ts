// ABOUTME: Common-date views of immutable accepted/reviewed forecasts using the shared numerical kernels.
// ABOUTME: Extension uses only the original snapshot assumptions and observations, never later user data.
import { addDays, daysBetween } from "../domain/facts";
import {
  ForecastSnapshotSchema,
  type ForecastSnapshot,
} from "../domain/forecast";
import type { CalculationRequest } from "../domain/workflow";
import { simulateModel, type SimulationInput } from "./models";
/** Derive a common-date comparison without rewriting an accepted or reviewed reference snapshot. */
export async function alignForecast(
  reference: ForecastSnapshot,
  profile: CalculationRequest["profile"],
  end: string,
): Promise<ForecastSnapshot> {
  if (end === reference.projectionDate) return reference;
  if (end < reference.asOfDate || end > addDays(reference.baselineDate, 365))
    throw new Error(
      "A reference comparison must stay after its observation cutoff and inside the original horizon.",
    );
  const days = Array.from(
    { length: daysBetween(reference.baselineDate, end) },
    (_, i) => {
      const date = addDays(reference.baselineDate, i),
        original = reference.resolvedDays.find((d) => d.date === date);
      if (original) return original;
      const last = reference.resolvedDays.at(-1)!;
      return {
        ...last,
        date,
        completed: false,
        meals: [],
        recordedBudgetShare: 0,
        intakeSource: "planned" as const,
        activitySource: "baseline" as const,
        activityDeltaKcalPerKgDay: 0,
      };
    },
  );
  const modelResults = reference.modelResults.map((m) => {
    if (m.status === "failed") return m;
    const measurements =
      reference.conditioning?.models
        .find((c) => c.id === m.id)
        ?.events.map((e) => ({
          day: daysBetween(reference.baselineDate, e.date),
          weightKg: e.observedWeightKg,
          bodyFatPct: e.observedBodyFatPct,
          method: e.method,
        })) ?? [];
    const input: SimulationInput = {
      profile,
      baseline: reference.baseline,
      dates: [...days.map((d) => d.date), end],
      intakes: days.map((d) => d.intakeKcal),
      activityDeltas: days.map((d) => d.activityDeltaKcalPerKgDay),
      measurements,
    };
    const current = simulateModel(m.id, input).points,
      accepted = simulateModel(m.id, { ...input, measurements: [] }).points;
    return {
      ...m,
      current,
      accepted,
      sensitivity: { lower: current, upper: current },
    };
  });
  return ForecastSnapshotSchema.parse({
    ...reference,
    projectionDate: end,
    resolvedDays: days,
    modelResults,
    inputHash: Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(reference.inputHash + ":" + end),
        ),
      ),
    )
      .map((v) => v.toString(16).padStart(2, "0"))
      .join(""),
  });
}
