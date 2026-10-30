// ABOUTME: Typed comparison and review-eligibility evidence shared by transport, application and policy.
// ABOUTME: Trigger evidence is not a diagnosis or target-change permission.
import { z } from "zod";
import { DateSchema } from "./facts";
export const ProjectionSummarySchema = z
  .object({
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    comparisonDate: DateSchema,
    weightKg: z.number().finite().positive(),
    bodyFatPct: z.number().finite().positive().max(100).nullable(),
    arrivalDate: DateSchema.nullable(),
  })
  .strict();
export const MeasurementReviewInputSchema = z
  .object({
    asOfDate: DateSchema,
    hasChangedMeasurement: z.boolean(),
    baselineWeightKg: z.number().positive(),
    reference: ProjectionSummarySchema,
    updated: ProjectionSummarySchema,
    numericalDatesSinceAcceptance: z.array(DateSchema),
    bodyFatMethodChanged: z.boolean(),
    scopeConcern: z.boolean(),
    pendingReview: z.boolean(),
    previouslyAssessedHash: z.string().nullable(),
    lastCoachDate: DateSchema.nullable(),
    lastReviewedProjection: ProjectionSummarySchema.nullable(),
  })
  .strict();
export type MeasurementReviewInput = z.infer<
  typeof MeasurementReviewInputSchema
>;
export type MeasurementReviewReason =
  | "scope_concern"
  | "weight_projection_changed"
  | "body_fat_projection_changed"
  | "arrival_changed"
  | "goal_no_longer_reached"
  | "measurement_method_changed";
export interface MeasurementReviewDecision {
  policyVersion: string;
  eligible: boolean;
  reasons: MeasurementReviewReason[];
  evidence: "single_check_in" | "repeated_check_ins";
  suppression:
    | "no_numerical_change"
    | "already_assessed"
    | "review_pending"
    | "cooldown"
    | "below_threshold"
    | null;
  weightDeltaKg: number;
  bodyFatDeltaPp: number | null;
  arrivalDeltaDays: number | null;
}
