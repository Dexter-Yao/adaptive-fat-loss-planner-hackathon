// ABOUTME: Versioned internal model checkpoints and measurement-conditioning receipts.
// ABOUTME: Calculation state is not a user fact and never grants the LLM parameter-write access.
import { z } from "zod";
import { DateSchema } from "./facts";

const common = {
  version: z.literal(1),
  seed: z.string(),
  day: z.number().int().min(0).max(365),
};
export const ModelCheckpointSchema = z.discriminatedUnion("model", [
  z
    .object({
      ...common,
      model: z.literal("hall"),
      lean: z.number().positive(),
      gly: z.number().positive(),
      ecf: z.number().positive(),
      at: z.number().finite(),
      fatAnchor: z.number().positive(),
      leanAnchor: z.number().positive(),
    })
    .strict(),
  z
    .object({
      ...common,
      model: z.literal("thomas"),
      fat: z.number().positive(),
      logC: z.number().finite(),
    })
    .strict(),
  z
    .object({
      ...common,
      model: z.literal("antonetti"),
      weight: z.number().positive(),
    })
    .strict(),
]);
export type ModelCheckpoint = z.infer<typeof ModelCheckpointSchema>;
export interface ModelMeasurement {
  day: number;
  weightKg: number | null;
  bodyFatPct: number | null;
  method: string | null;
}
export const ConditioningEventSchema = z
  .object({
    date: DateSchema,
    status: z.enum(["applied", "unchanged", "unsupported", "not_supported"]),
    kind: z.enum(["weight", "body_fat", "joint"]),
    method: z.string().nullable(),
    priorWeightKg: z.number().positive(),
    priorBodyFatPct: z.number().positive().nullable(),
    observedWeightKg: z.number().positive().nullable(),
    observedBodyFatPct: z.number().positive().max(100).nullable(),
    estimatedWeightUsed: z.boolean(),
    explanation: z.string(),
  })
  .strict();
export type ConditioningEvent = z.infer<typeof ConditioningEventSchema>;
export type ModelConditioningEvent = Omit<ConditioningEvent, "date"> & {
  day: number;
};
export const CONDITIONING_VERSION =
  "state-preserving-observation-2026-10-28-v1";

/** Solve the current Forbes relation without changing its anchor or attributing a cause. */
export function fatForStructuralMass(
  total: number,
  fatAnchor: number,
  leanAnchor: number,
): number {
  if (!(total > 0))
    throw new Error("The measurement leaves no positive structural mass.");
  let lo = fatAnchor * Math.exp(-leanAnchor / 10.4),
    hi = Math.max(total, fatAnchor);
  const mass = (f: number) => f + leanAnchor + 10.4 * Math.log(f / fatAnchor);
  if (mass(lo) >= total)
    throw new Error(
      "No positive compatible lean/fat state represents this measurement.",
    );
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (mass(mid) < total) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Reject ambiguous observation ordering before any numerical state is advanced. */
export function validateModelMeasurements(
  values: ModelMeasurement[],
  days: number,
): void {
  let last = -1;
  for (const v of values) {
    if (
      !Number.isInteger(v.day) ||
      v.day < 0 ||
      v.day > days ||
      v.day <= last ||
      (v.weightKg === null && v.bodyFatPct === null) ||
      (v.weightKg !== null &&
        (!Number.isFinite(v.weightKg) || v.weightKg <= 0)) ||
      (v.bodyFatPct !== null &&
        (!Number.isFinite(v.bodyFatPct) ||
          v.bodyFatPct <= 0 ||
          v.bodyFatPct >= 100))
    )
      throw new Error(
        "Measurements must be unique, ordered, finite and inside the model horizon.",
      );
    last = v.day;
  }
}
