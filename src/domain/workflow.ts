// ABOUTME: Canonical deterministic calculation and model-stage ports for workstreams A, B and C.
// ABOUTME: Stage envelopes bind to one request, session, fact/action revision and accepted journey; model content owns none of them.
import { z } from "zod";
import { WeeklyActionPlanSchema } from "./actions";
import { ContextAssessmentSchema, DecisionSchema } from "./analysis";
import { CoachRequestSchema, PlanningSnapshotSchema } from "./coach";
import {
  DailyObservationSchema,
  DateSchema,
  GoalSpecSchema,
  PlanningPreferencesSchema,
  ProfileFactsSchema,
  TargetRevisionSchema,
} from "./facts";
import {
  BaselineEstimateSchema,
  ForecastSnapshotSchema,
  ModelIdSchema,
  ModelPointSchema,
} from "./forecast";
import { InitializationReviewSchema } from "./initialization";
import {
  CoachRecommendationSchema,
  JourneyContentSchema,
  JourneyDraftSchema,
  JourneyFeedbackSchema,
  RevisionIntentSchema,
} from "./journey";
import { ProjectionSummarySchema } from "./measurement-review";

export const RequestBindingSchema = z
  .object({
    requestId: z.string().min(1),
    sessionId: z.string().min(1),
    sourceRevision: z.number().int().nonnegative(),
    actionsRevision: z.number().int().nonnegative(),
    acceptedJourneyId: z.string().nullable(),
    asOfDate: DateSchema,
  })
  .strict();
export type RequestBinding = z.infer<typeof RequestBindingSchema>;
export const CalculationRequestSchema = z
  .object({
    kind: z.literal("journey_calculation"),
    binding: RequestBindingSchema,
    profile: ProfileFactsSchema,
    goal: GoalSpecSchema,
    preferences: PlanningPreferencesSchema,
    logs: z.array(DailyObservationSchema).max(366),
    targetRevisions: z.array(TargetRevisionSchema).max(30),
    projectionDate: DateSchema.nullable().default(null),
    revision: z
      .object({ targetDate: DateSchema, mode: z.enum(["loss", "maintenance"]) })
      .strict()
      .nullable()
      .default(null),
  })
  .strict()
  .superRefine((r, c) => {
    const canonical = CoachRequestSchema.safeParse({
      sessionId: r.binding.sessionId,
      sourceRevision: r.binding.sourceRevision,
      asOfDate: r.binding.asOfDate,
      actionsRevision: r.binding.actionsRevision,
      action: "update",
      profile: r.profile,
      goal: r.goal,
      preferences: r.preferences,
      logs: r.logs,
      targetRevisions: r.targetRevisions,
    });
    // The established request boundary owns dates, units, historical targets and meal provenance.
    if (!canonical.success)
      for (const issue of canonical.error.issues)
        c.addIssue({ code: "custom", message: issue.message });
  });
export type CalculationRequest = z.infer<typeof CalculationRequestSchema>;
export const CalculationResponseSchema = z
  .object({
    kind: z.literal("journey_calculation"),
    binding: RequestBindingSchema,
    snapshot: PlanningSnapshotSchema,
    proposedTargets: z.array(TargetRevisionSchema),
    targetScheduleHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .superRefine((r, c) => {
    if (
      r.snapshot.sourceRevision !== r.binding.sourceRevision ||
      r.snapshot.asOfDate !== r.binding.asOfDate ||
      (r.snapshot.forecast &&
        r.snapshot.forecast.asOfDate !== r.binding.asOfDate)
    )
      c.addIssue({
        code: "custom",
        message:
          "Calculation dates and source versions must match their request binding.",
      });
  });
export type CalculationResponse = z.infer<typeof CalculationResponseSchema>;

export const StageCalculationSchema = z
  .object({
    binding: RequestBindingSchema,
    forecastInputHash: z.string().nullable(),
    targetScheduleHash: z.string(),
    targetDate: DateSchema.nullable(),
    baseline: BaselineEstimateSchema.nullable(),
    proposedTargets: z.array(TargetRevisionSchema),
    decision: DecisionSchema,
    context: ContextAssessmentSchema,
    assumptions: z.array(z.string()),
    models: z.array(
      z
        .object({
          id: ModelIdSchema,
          status: z.enum(["ok", "failed"]),
          error: z.string().nullable(),
          endpoint: ModelPointSchema.nullable(),
        })
        .strict(),
    ),
    milestones: z.array(ModelPointSchema).max(54),
  })
  .strict();
export const StageRequestSchema = z
  .object({
    binding: RequestBindingSchema,
    stage: z.enum(["interpret", "generate", "revise", "review_progress"]),
    profile: ProfileFactsSchema,
    goal: GoalSpecSchema,
    preferences: PlanningPreferencesSchema,
    sources: z.record(z.string(), z.string()),
    calculation: StageCalculationSchema.nullable(),
    previousDraft: JourneyDraftSchema.nullable(),
    feedback: JourneyFeedbackSchema.nullable(),
    revisionIntent: RevisionIntentSchema.nullable().optional(),
    acceptedDraft: JourneyDraftSchema.nullable(),
    acceptedStrategy: JourneyContentSchema.pick({
      headline: true,
      summary: true,
      phases: true,
    }).nullable(),
    latestReview: CoachRecommendationSchema.nullable(),
    weeklyPlans: z.array(WeeklyActionPlanSchema),
    measurements: z.array(DailyObservationSchema),
    historyCoverage: z
      .object({
        totalRecords: z.number().int().nonnegative(),
        includedRecords: z.number().int().nonnegative(),
        firstIncludedDate: DateSchema.nullable(),
      })
      .strict(),
    comparison: z
      .object({
        date: DateSchema,
        reference: ProjectionSummarySchema,
        previous: ProjectionSummarySchema.nullable(),
        updated: ProjectionSummarySchema,
        reasons: z.array(z.string()),
        evidence: z.enum(["single_check_in", "repeated_check_ins"]),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type StageRequest = z.infer<typeof StageRequestSchema>;
export const StageResponseSchema = z.discriminatedUnion("stage", [
  z
    .object({
      binding: RequestBindingSchema,
      stage: z.literal("interpret"),
      result: InitializationReviewSchema,
    })
    .strict(),
  z
    .object({
      binding: RequestBindingSchema,
      stage: z.literal("generate"),
      result: JourneyContentSchema,
    })
    .strict(),
  z
    .object({
      binding: RequestBindingSchema,
      stage: z.literal("revise"),
      result: JourneyContentSchema,
    })
    .strict(),
  z
    .object({
      binding: RequestBindingSchema,
      stage: z.literal("review_progress"),
      result: CoachRecommendationSchema,
    })
    .strict(),
]);
export type StageResponse = z.infer<typeof StageResponseSchema>;
export type ModelStage = StageRequest["stage"];
export interface JourneyPorts {
  calculate(
    request: CalculationRequest,
    signal: AbortSignal,
  ): Promise<CalculationResponse>;
  stage(request: StageRequest, signal: AbortSignal): Promise<StageResponse>;
}

export const MeasurementUpdateSchema = z
  .object({
    date: DateSchema,
    weightKg: DailyObservationSchema.shape.weightKg,
    bodyFat: DailyObservationSchema.shape.bodyFat,
    notes: z.string().max(1500),
  })
  .strict();
export type MeasurementUpdate = z.infer<typeof MeasurementUpdateSchema>;

export const JourneyFlowSchema = z
  .object({
    enabled: z.boolean(),
    candidateDraftId: z.string().nullable(),
    revisionRequest: CalculationRequestSchema.shape.revision,
    revisionIntent: RevisionIntentSchema.nullable().optional(),
    calculation: CalculationResponseSchema.nullable(),
    drafts: z.array(JourneyDraftSchema),
    feedback: z.array(JourneyFeedbackSchema),
    acceptances: z.array(
      z
        .object({
          id: z.string(),
          draftId: z.string(),
          acceptedOn: DateSchema,
          reference: ForecastSnapshotSchema,
        })
        .strict(),
    ),
    task: z
      .object({
        binding: RequestBindingSchema,
        stage: z.enum([
          "interpret",
          "calculate",
          "generate",
          "revise",
          "review_progress",
          "accept",
        ]),
        status: z.enum(["running", "interrupted", "failed"]),
        error: z.string().nullable(),
      })
      .strict()
      .nullable(),
    reviews: z.array(
      z
        .object({
          binding: RequestBindingSchema,
          forecast: ForecastSnapshotSchema,
          result: CoachRecommendationSchema,
          dismissed: z.boolean(),
        })
        .strict(),
    ),
    assessedKeys: z.array(z.string()),
    assessments: z.array(
      z
        .object({
          inputHash: z.string(),
          asOfDate: DateSchema,
          eligible: z.boolean(),
          reasons: z.array(z.string()),
          suppression: z.string().nullable(),
          policyVersion: z.string(),
        })
        .strict(),
    ),
    forecastHistory: z.array(PlanningSnapshotSchema),
    acceptanceActionsRevision: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type JourneyFlow = z.infer<typeof JourneyFlowSchema>;
export function emptyJourneyFlow(enabled = false): JourneyFlow {
  return {
    enabled,
    candidateDraftId: null,
    revisionRequest: null,
    calculation: null,
    drafts: [],
    feedback: [],
    acceptances: [],
    task: null,
    reviews: [],
    assessedKeys: [],
    assessments: [],
    forecastHistory: [],
    acceptanceActionsRevision: null,
  };
}
