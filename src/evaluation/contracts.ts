// ABOUTME: Shared run identity and human annotation shape; no automatic gold labels or invented rubric scores.
// ABOUTME: Offline evals declare fictional inputs explicitly; live browser requests cannot opt into raw tracing.
import { z } from "zod";
import { StageRequestSchema } from "../domain/workflow";

const Identifier = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[\w.-]+$/);
export const EvalIdentitySchema = z
  .object({
    caseId: Identifier,
    datasetVersion: Identifier,
    experimentId: Identifier,
    split: z.enum(["exploration", "calibration", "holdout"]),
    dataClass: z.literal("fictional"),
  })
  .strict();
export type EvalIdentity = z.infer<typeof EvalIdentitySchema>;
export const HumanAnnotationSchema = z
  .object({
    caseId: Identifier,
    runId: z.uuid(),
    stage: StageRequestSchema.shape.stage,
    reviewer: z.string().min(1).max(100),
    reviewedAt: z.iso.datetime(),
    verdict: z.enum(["pass", "fail"]),
    critique: z.string().min(1).max(6000),
    firstFailingOperation: z.string().min(1).max(100).nullable(),
    failureTags: z.array(z.string().min(1).max(100)).max(20),
  })
  .strict();
export type HumanAnnotation = z.infer<typeof HumanAnnotationSchema>;
