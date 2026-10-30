// ABOUTME: Provider selection and public-deployment readiness; never returns credential values.
import { codexProvider } from "./providers/codex";
import { nebiusProvider } from "./providers/nebius";
import type { ModelStage } from "../domain/workflow";
import { stageModelConfiguration } from "./model-routing";
import { reviewAccessConfigured } from "../server/reviewer-access";

export function selectedProvider(stage?: ModelStage) {
  const name =
    process.env.AGENT_PROVIDER || (process.env.VERCEL ? "nebius" : "codex");
  if (name !== "codex" && name !== "nebius")
    throw new Error("AGENT_PROVIDER must be codex or nebius.");
  return name === "codex"
    ? codexProvider()
    : nebiusProvider(stage ? stageModelConfiguration(process.env, stage) : {});
}

export function providerStatus() {
  const provider = selectedProvider();
  const deployed =
    Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
  const ready =
    provider.name === "codex"
      ? !deployed
      : Boolean(process.env.NEBIUS_API_KEY) &&
        (!deployed ||
          (process.env.PUBLIC_DEMO_ENABLED === "true" &&
            reviewAccessConfigured()));
  return {
    provider: provider.name,
    model: provider.model,
    models: Object.fromEntries(
      (["interpret", "generate", "revise", "review_progress"] as const).map(
        (stage) => [stage, selectedProvider(stage).model],
      ),
    ),
    ready,
    label:
      provider.name === "codex"
        ? "Local development · Luna"
        : `Nebius Token Factory · ${provider.model}`,
    message: ready
      ? null
      : provider.name === "codex"
        ? "The local Luna connection cannot run on a public deployment. Configure Nebius on the server."
        : "Live Nebius access has not been enabled on this server yet.",
  };
}
