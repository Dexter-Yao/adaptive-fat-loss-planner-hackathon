// ABOUTME: Explicit per-operation Nebius configuration; it does not select a winning model or add fallbacks.
// ABOUTME: Unset stage overrides preserve NEBIUS_MODEL and the existing provider defaults.
import { z } from "zod";
import type { ModelStage } from "../domain/workflow";
import type { NebiusOptions } from "./providers/nebius";

const keys: Record<ModelStage, string> = {
  interpret: "NEBIUS_INTERPRET",
  generate: "NEBIUS_GENERATE",
  revise: "NEBIUS_REVISE",
  review_progress: "NEBIUS_REVIEW_PROGRESS",
};
const ModelSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\w./-]+$/);
export function stageModelConfiguration(
  env: Record<string, string | undefined>,
  stage: ModelStage,
): NebiusOptions {
  const key = keys[stage];
  const model = env[`${key}_MODEL`] || env.NEBIUS_MODEL;
  const thinking = env[`${key}_THINKING`] || "auto";
  z.enum(["auto", "on", "off"]).parse(thinking);
  const tokens = env[`${key}_MAX_TOKENS`];
  return {
    ...(model ? { model: ModelSchema.parse(model) } : {}),
    ...(thinking === "auto" ? {} : { thinking: thinking === "on" }),
    ...(tokens
      ? {
          maxTokens: z.coerce.number().int().min(512).max(16_384).parse(tokens),
        }
      : {}),
  };
}
