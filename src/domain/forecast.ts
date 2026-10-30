// ABOUTME: Derived input and output contracts shared by all three numerical adapters.
// ABOUTME: Model capability, imputation provenance and sensitivity are explicit, never clinical confidence.
import { z } from "zod";
import { DateSchema, addDays, daysBetween } from "./facts";
import { ModelCheckpointSchema, ConditioningEventSchema } from "./model-state";
export const ModelIdSchema = z.enum(["hall", "thomas", "antonetti"]);
export type ModelId = z.infer<typeof ModelIdSchema>;
export const BaselineEstimateSchema = z
  .object({
    pal: z.number().min(1.4).max(2.4),
    rmrKcal: z.number().positive(),
    tdeeKcal: z.number().positive(),
    fatMassKg: z.number().positive(),
    bodyFatPct: z.number().positive(),
    bodyFatSource: z.enum(["user_reported", "jackson_reference"]),
    activitySource: z.enum(["questionnaire", "migrated"]),
    activityVersion: z.string(),
  })
  .strict();
export type BaselineEstimate = z.infer<typeof BaselineEstimateSchema>;
export const ResolvedMealSchema = z
  .object({
    slotId: z.string(),
    label: z.string(),
    budgetKcal: z.number().int().nonnegative(),
    kcal: z.number().finite().nonnegative(),
    source: z.enum(["recorded", "skipped", "imputed_plan", "planned"]),
    multiplier: z.number().nullable(),
  })
  .strict();
export const ResolvedDayInputSchema = z
  .object({
    date: DateSchema,
    intakeKcal: z.number().finite().min(0),
    intakeSource: z.enum([
      "daily_total",
      "meals",
      "imputed_plan",
      "planned",
      "recent_pattern",
    ]),
    meals: z.array(ResolvedMealSchema),
    recordedBudgetShare: z.number().min(0).max(1),
    activityDeltaKcalPerKgDay: z.number().finite(),
    activitySource: z.enum(["recorded", "baseline", "rolling_mean"]),
    completed: z.boolean(),
  })
  .strict();
export type ResolvedDayInput = z.infer<typeof ResolvedDayInputSchema>;
export const ModelPointSchema = z
  .object({
    date: DateSchema,
    weightKg: z.number().finite().positive(),
    fatMassKg: z.number().finite().positive().nullable(),
    fatFreeMassKg: z.number().finite().positive().nullable(),
    bodyFatPct: z.number().finite().min(0).max(100).nullable(),
    expenditureKcal: z.number().finite().nullable(),
  })
  .strict();
export type ModelPoint = z.infer<typeof ModelPointSchema>;
export const ModelResultSchema = z
  .object({
    id: ModelIdSchema,
    equationVersion: z.string(),
    implementationVersion: z.string(),
    composition: z.boolean(),
    status: z.enum(["ok", "failed"]),
    error: z.string().nullable(),
    diagnostics: z.array(z.string()),
    accepted: z.array(ModelPointSchema),
    current: z.array(ModelPointSchema),
    sensitivity: z.object({
      lower: z.array(ModelPointSchema),
      upper: z.array(ModelPointSchema),
    }),
    parameters: z.record(z.string(), z.union([z.number(), z.string()])),
  })
  .strict()
  .superRefine((m, c) => {
    if (m.composition !== (m.id !== "antonetti"))
      c.addIssue({
        code: "custom",
        message: "Model capability must match its registered equation.",
      });
    const series = [
      m.accepted,
      m.current,
      m.sensitivity.lower,
      m.sensitivity.upper,
    ];
    if (m.status === "failed") {
      if (!m.error || series.some((s) => s.length))
        c.addIssue({
          code: "custom",
          message:
            "A failed model must expose an error and no substitute curve.",
        });
      return;
    }
    if (
      m.error ||
      !m.current.length ||
      series.some(
        (s) =>
          s.length !== m.current.length ||
          s.some((p, i) => p.date !== m.current[i].date),
      )
    )
      c.addIssue({
        code: "custom",
        message: "Model scenarios must have matching dated outputs.",
      });
    for (const p of series.flat()) {
      if (m.composition) {
        if (
          p.fatMassKg === null ||
          p.fatFreeMassKg === null ||
          p.bodyFatPct === null ||
          Math.abs(p.fatMassKg + p.fatFreeMassKg - p.weightKg) > 1e-7 ||
          Math.abs((p.fatMassKg / p.weightKg) * 100 - p.bodyFatPct) > 1e-7
        )
          c.addIssue({
            code: "custom",
            message: "Composition must come from one consistent model state.",
          });
      } else if (
        p.fatMassKg !== null ||
        p.fatFreeMassKg !== null ||
        p.bodyFatPct !== null
      )
        c.addIssue({
          code: "custom",
          message: "This model cannot emit body-composition estimates.",
        });
    }
  });

export type ModelResult = z.infer<typeof ModelResultSchema>;
export const ForecastSnapshotSchema = z
  .object({
    conditioning: z
      .object({
        version: z.string(),
        cutoff: DateSchema,
        assumptionMode: z.literal("accepted_plan"),
        models: z
          .array(
            z
              .object({
                id: ModelIdSchema,
                checkpoint: ModelCheckpointSchema.nullable(),
                events: z.array(ConditioningEventSchema),
              })
              .strict(),
          )
          .length(3),
      })
      .strict()
      .optional(),
    goalOutcomes: z.object({ accepted: z.boolean(), current: z.boolean() }),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    inputPolicy: z
      .object({
        missingMealMultiplier: z.union([
          z.literal(1),
          z.literal(1.2),
          z.literal(1.5),
          z.literal(2),
        ]),
        rollingWindowDays: z.literal(7),
        timezone: z.string(),
      })
      .strict(),
    policyVersion: z.string(),
    asOfDate: DateSchema,
    baselineDate: DateSchema,
    targetDate: DateSchema,
    projectionDate: DateSchema,
    baseline: BaselineEstimateSchema,
    modelResults: z.array(ModelResultSchema).length(3),
    resolvedDays: z.array(ResolvedDayInputSchema),
    coverage: z.object({
      windowDays: z.number(),
      recordedBudgetShare: z.number(),
      completedDays: z.number(),
      recordedDays: z.number(),
      missingMeals: z.number(),
      activityDays: z.number(),
      weightDays: z.number(),
      totalMissingMeals: z.number(),
    }),
    weightErrors: z.array(
      z.object({
        date: DateSchema,
        actualKg: z.number(),
        predictedKg: z.number(),
        residualKg: z.number(),
      }),
    ),
    bodyFatErrors: z.array(
      z.object({
        date: DateSchema,
        actualPct: z.number(),
        predictedPct: z.number(),
        residualPct: z.number(),
        method: z.string(),
      }),
    ),
    assumptions: z.array(z.string()),
  })
  .strict()
  .superRefine((f, c) => {
    if (f.conditioning) {
      if (
        f.conditioning.cutoff !== f.asOfDate ||
        new Set(f.conditioning.models.map((m) => m.id)).size !== 3
      )
        c.addIssue({
          code: "custom",
          message:
            "Conditioning must name each model once and use the snapshot cutoff.",
        });
      for (const m of f.conditioning.models) {
        if (
          (m.checkpoint &&
            (m.checkpoint.model !== m.id ||
              m.checkpoint.day !== daysBetween(f.baselineDate, f.asOfDate))) ||
          new Set(m.events.map((e) => e.date)).size !== m.events.length ||
          m.events.some((e) => e.date < f.baselineDate || e.date > f.asOfDate)
        )
          c.addIssue({
            code: "custom",
            message:
              "Conditioning checkpoints and events must retain their model and causal dates.",
          });
      }
    }
    if (
      new Set(f.modelResults.map((m) => m.id)).size !== 3 ||
      f.modelResults.find((m) => m.id === "hall")?.status !== "ok"
    )
      c.addIssue({
        code: "custom",
        message:
          "Hall must succeed; all three distinct models must be represented.",
      });
    for (const m of f.modelResults.filter((m) => m.status === "ok"))
      if (
        m.current[0]?.date !== f.baselineDate ||
        m.current.at(-1)?.date !== f.projectionDate ||
        m.current.length !==
          daysBetween(f.baselineDate, f.projectionDate) + 1 ||
        m.current.some((p, i) => p.date !== addDays(f.baselineDate, i))
      )
        c.addIssue({
          code: "custom",
          message: "Model outputs must share the forecast horizon.",
        });
  });

export type ForecastSnapshot = z.infer<typeof ForecastSnapshotSchema>;
export function modelResult(
  f: ForecastSnapshot,
  id: ModelId = "hall",
): ModelResult {
  return f.modelResults.find((x) => x.id === id)!;
}
export function endpoint(
  f: ForecastSnapshot,
  scenario: "accepted" | "current" = "current",
  id: ModelId = "hall",
): ModelPoint | null {
  return modelResult(f, id)[scenario].at(-1) ?? null;
}
