// ABOUTME: Capture the local model and reasoning effort once per provider instance.
// ABOUTME: Credentials remain outside this configuration; unsupported settings never silently downgrade.
import { z } from "zod";
export const LocalReasoningEffortSchema = z.enum([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
export type LocalReasoningEffort = z.infer<typeof LocalReasoningEffortSchema>;
export interface LocalProviderOptions {
  model?: string;
  reasoningEffort?: LocalReasoningEffort;
}
export function localProviderConfig(
  options: LocalProviderOptions = {},
  environment: Record<string, string | undefined> = process.env,
): { model: string; reasoningEffort: LocalReasoningEffort } {
  return {
    model: z
      .string()
      .trim()
      .min(1)
      .parse(options.model ?? environment.CODEX_MODEL ?? "gpt-6-luna"),
    reasoningEffort: LocalReasoningEffortSchema.parse(
      options.reasoningEffort ?? environment.CODEX_REASONING_EFFORT ?? "medium",
    ),
  };
}
