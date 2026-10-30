// ABOUTME: Replanning identity binds a candidate to unchanged active facts and acceptance.
// ABOUTME: Candidate facts use the existing Session core; no observation or goal is duplicated here.
import { z } from "zod";
import { DateSchema } from "./facts";
export const ReplanningMetadataSchema = z
  .object({
    id: z.string().min(1),
    sourceSessionId: z.string().min(1),
    sourceRevision: z.number().int().nonnegative(),
    sourceActionsRevision: z.number().int().nonnegative(),
    sourceAcceptedJourneyId: z.string().min(1),
    startedOn: DateSchema,
    step: z.enum(["setup", "proposal"]),
  })
  .strict();
