// ABOUTME: Validated domain data with no browser, model-provider, or storage dependencies.
import { z } from "zod";
import { DateSchema } from "./facts";
export const EvidenceSchema = z
  .object({
    sourceId: z.string().min(1).max(80),
    quote: z.string().min(1).max(400),
  })
  .strict();
export const ContextAssessmentSchema = z
  .object({
    applicability: z.enum(["standard", "unsupported", "needs_confirmation"]),
    reason: z.string().max(400).nullable(),
    constraints: z
      .array(
        z
          .object({
            kind: z.enum(["food_exclusion", "allergy", "practical"]),
            label: z.string().min(1).max(160),
            scope: z.enum(["ongoing", "temporary"]),
            untilDate: DateSchema.nullable(),
            evidence: z.array(EvidenceSchema).min(1).max(3),
          })
          .strict(),
      )
      .max(20),
    signals: z
      .array(
        z
          .object({
            kind: z.enum(["unsupported", "urgent_symptom", "low_feasibility"]),
            label: z.string().min(1).max(200),
            evidence: z.array(EvidenceSchema).min(1).max(3),
          })
          .strict(),
      )
      .max(10),
  })
  .strict();
export type ContextAssessment = z.infer<typeof ContextAssessmentSchema>;
export interface ContextSource {
  id: string;
  text: string;
  date: string | null;
}
export const ProposalSchema = z.object({
  id: z.string(),
  kind: z.enum(["extend_timeline", "maintenance"]),
  title: z.string(),
  reason: z.string(),
  dailyCalories: z.number(),
  targetDate: DateSchema,
  projectedWeightKg: z.number(),
  effectiveFrom: DateSchema,
});
export type Proposal = z.infer<typeof ProposalSchema>;
export const DecisionSchema = z.object({
  status: z.enum([
    "active",
    "review",
    "maintenance",
    "paused",
    "needs_confirmation",
  ]),
  code: z.string(),
  title: z.string(),
  summary: z.string(),
  facts: z.array(z.string()),
  proposal: ProposalSchema.nullable(),
  reviewMetrics: z.array(z.string()),
});
export type Decision = z.infer<typeof DecisionSchema>;
export const NumbersSchema = z.object({
  dailyCalories: z.number().nullable(),
  targetDate: DateSchema,
  projectedWeightKg: z.number().nullable(),
});
export type PreviousNumbers = z.infer<typeof NumbersSchema>;
