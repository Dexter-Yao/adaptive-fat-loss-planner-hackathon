// ABOUTME: Real LangSmith write/readback using fictional inputs and a synthetic provider, without paid inference.
// ABOUTME: This proves instrumentation only; it cannot establish NVIDIA inference or coaching quality.
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { runObservedStage } from "../src/agent/observed-stage";
import { langSmithClient, type TraceExport } from "../src/agent/observability";
import { generationInput } from "../src/agent/stage-router";
import {
  journeyStageFixture,
  syntheticJourney,
  syntheticGuidanceContent,
} from "../tests/support/journey-agent";

async function main() {
  const request = journeyStageFixture().request;
  const client = langSmithClient();
  let exported: TraceExport | undefined;
  const response = await runObservedStage(
    request,
    {
      name: "nebius",
      model: "synthetic-instrumentation-no-inference",
      async run(_instructions, _context, tools, handle) {
        const reply = await handle(
          tools[0].name,
          syntheticGuidanceContent(syntheticJourney(generationInput(request))),
        );
        if (reply.status !== "ok")
          throw Error("Synthetic instrumentation candidate failed validation.");
      },
    },
    {},
    {
      env: { ...process.env, LANGSMITH_TRACING: "true" },
      client,
      fictionalEval: {
        caseId: "instrumentation-only",
        datasetVersion: "foundation-v1",
        experimentId: `instrumentation-${Date.now()}`,
        split: "exploration",
        dataClass: "fictional",
      },
      onExport: (receipt) => {
        exported = receipt;
      },
    },
  );
  let readback = "not_attempted",
    children: number | null = null;
  if (exported?.status === "submitted" && exported.runId) {
    try {
      const endpoint = new URL(
        `/runs/${exported.runId}`,
        process.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com",
      );
      const checked = await fetch(endpoint, {
        headers: {
          "x-api-key": process.env.LANGSMITH_API_KEY!,
          ...(process.env.LANGSMITH_WORKSPACE_ID
            ? { "x-tenant-id": process.env.LANGSMITH_WORKSPACE_ID }
            : {}),
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!checked.ok)
        throw Object.assign(new Error("Readback unavailable"), {
          status: checked.status,
        });
      const run = z
        .object({
          id: z.uuid(),
          extra: z
            .object({ metadata: z.record(z.string(), z.unknown()).optional() })
            .optional(),
          child_run_ids: z.array(z.uuid()).default([]),
        })
        .parse(await checked.json());
      const exact =
        run.id === exported.runId &&
        run.extra?.metadata?.caseId === "instrumentation-only";
      children = run.child_run_ids.length;
      readback =
        exact && run.child_run_ids.length > 0 ? "verified" : "not_yet_complete";
    } catch (e) {
      const status =
        (e as { status?: number; statusCode?: number }).status ??
        (e as { statusCode?: number }).statusCode;
      readback = status === 403 ? "read_forbidden" : "read_unavailable";
    }
  }
  const receipt = {
    checkedAt: new Date().toISOString(),
    kind: "instrumentation-only",
    modelInferenceCalls: 0,
    responseStage: response.stage,
    export: exported,
    readback,
    children,
    note: "Fictional fixture and synthetic provider. Submission acceptance is not readback proof or a model-quality result.",
  };
  await mkdir(".runtime", { recursive: true });
  const path = `.runtime/observability-${Date.now()}.json`;
  await writeFile(path, JSON.stringify(receipt, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ ...receipt, receiptPath: path }, null, 2));
  if (exported?.status !== "submitted") process.exitCode = 1;
}
main().catch(() => {
  console.error(
    "LangSmith operational check failed; no credential or raw error was printed.",
  );
  process.exitCode = 1;
});
