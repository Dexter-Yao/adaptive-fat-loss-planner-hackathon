// ABOUTME: One source-quoted reason contract shared by journey prose, phase guidance and progress coaching.
// ABOUTME: Parsing shape does not verify a quotation; stage validators must check canonical source text.
import { z } from "zod";
export const SourceReasonSchema = z
  .object({
    sourceId: z.string().min(1).max(100),
    quote: z.string().min(1).max(500),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
