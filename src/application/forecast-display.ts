// ABOUTME: Validated presentation defaults; these never change facts, forecast hashes or planning policy.
// ABOUTME: The root session persists them independently of active/candidate/archived business cores.
import { z } from "zod";
import type { GoalSpec } from "../domain/facts";
import type { Session } from "./session";
export const ForecastSelectionSchema = z.enum([
  "mean",
  "hall",
  "thomas",
  "antonetti",
]);
export type ForecastSelection = z.infer<typeof ForecastSelectionSchema>;
export const ForecastDisplaySchema = z
  .object({
    defaults: z
      .object({
        weight: ForecastSelectionSchema.default("mean"),
        body_fat: z.enum(["mean", "hall", "thomas"]).default("mean"),
      })
      .strict()
      .prefault({}),
    dailyVariation: z.boolean().default(true),
  })
  .strict()
  .prefault({});
export type ForecastDisplay = z.infer<typeof ForecastDisplaySchema>;
export function pinForecastSelection(
  display: ForecastDisplay,
  metric: GoalSpec["kind"],
  selection: ForecastSelection,
): ForecastDisplay {
  return ForecastDisplaySchema.parse({
    ...display,
    defaults: { ...display.defaults, [metric]: selection },
  });
}

/** A cross-tab view-only write must not cancel an in-flight calculation or coach stage. */
export function sameForecastBusinessState(
  before: Session | null,
  after: Session | null,
): boolean {
  if (!before || !after) return before === after;
  const { forecastDisplay: _beforeDisplay, ...beforeCore } = before;
  const { forecastDisplay: _afterDisplay, ...afterCore } = after;
  return JSON.stringify(beforeCore) === JSON.stringify(afterCore);
}
