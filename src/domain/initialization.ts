// ABOUTME: Initial interpretation is a source-quoted review, never permission to invent physiology.
import { z } from "zod";
import {
  ProfileFactsSchema,
  GoalSpecSchema,
  PlanningPreferencesSchema,
  WorkLevelSchema,
  LeisureLevelSchema,
} from "./facts";
import { BaselineEstimateSchema } from "./forecast";
export const InitializationInputSchema = z
  .object({
    profile: ProfileFactsSchema,
    goal: GoalSpecSchema,
    preferences: PlanningPreferencesSchema,
  })
  .strict();
export type InitializationInput = z.infer<typeof InitializationInputSchema>;
export const InitializationInterpretationSchema = z
  .object({
    work: WorkLevelSchema,
    leisure: LeisureLevelSchema,
    rationale: z
      .array(
        z
          .object({
            sourceId: z.enum([
              "work",
              "leisure",
              "routines",
              "preferences",
              "context",
              "bodyFat",
            ]),
            quote: z.string().min(1).max(300),
            explanation: z.string().min(1).max(300),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    clarification: z.string().max(300).nullable(),
  })
  .strict();
export const InitializationReviewSchema = z
  .object({
    baseline: BaselineEstimateSchema,
    interpretation: InitializationInterpretationSchema.nullable(),
    aiStatus: z.enum(["completed", "unavailable"]),
    message: z.string().nullable(),
    promptVersion: z.string(),
  })
  .strict();
export type InitializationReview = z.infer<typeof InitializationReviewSchema>;
