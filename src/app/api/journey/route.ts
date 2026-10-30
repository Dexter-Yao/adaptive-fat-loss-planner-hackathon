// ABOUTME: B-owned model-stage HTTP boundary consumed by A's canonical JourneyPorts.
// ABOUTME: No provider fallback or session mutation; successful responses echo the exact checked request binding.
import { runObservedStage } from "@/agent/observed-stage";
import { StageRequestSchema } from "@/domain/workflow";
import { StageFailure } from "@/agent/stage-runtime";
import { selectedProvider, providerStatus } from "@/agent/config";
import { readApplicationJson, errorResponse, HttpError } from "@/server/http";
import { recordLocalStageIssues } from "@/server/stage-diagnostics";
import { requireReviewer, reviewAccessEnabled } from "@/server/reviewer-access";
import { enforceHostedRequestLimit } from "@/server/request-limits";
export const runtime = "nodejs";
// Covers the bounded 540s multi-batch generator plus response/validation overhead.
export const maxDuration = 600;
export async function POST(request: Request) {
  try {
    requireReviewer(request);
    const body = StageRequestSchema.parse(await readApplicationJson(request));
    if (!providerStatus().ready)
      throw new HttpError(
        503,
        "The configured AI provider is unavailable. Saved inputs, records and the accepted plan remain intact.",
      );
    if (reviewAccessEnabled())
      await enforceHostedRequestLimit("reviewer-model-stages", 30, 15 * 60_000);
    const result = await runObservedStage(
      body,
      selectedProvider(body.stage),
      {
        signal: request.signal,
        onTrace: (trace) => {
          recordLocalStageIssues(trace, request.url);
          if (process.env.ADAPTIVE_TRACE_METADATA === "true")
            console.info(
              JSON.stringify({
                event: "journey_stage",
                requestId: trace.requestId,
                runId: trace.runId,
                stage: trace.stage,
                operation: trace.toolName,
                promptVersion: trace.promptVersion,
                provider: trace.provider,
                model: trace.model,
                status: trace.status,
                elapsedMs: trace.elapsedMs,
                contextHash: trace.contextHash,
                submissions: trace.submissions.length,
                configuration: trace.providerOutput?.configuration ?? null,
                usageEvents: trace.providerOutput?.usageEvents ?? [],
              }),
            );
        },
      },
      {
        onExport: (receipt) => {
          if (receipt.status === "failed" || receipt.status === "unconfirmed")
            console.warn(
              JSON.stringify({
                event: "langsmith_export_failed",
                delivery: receipt.status,
                requestId: body.binding.requestId,
              }),
            );
        },
      },
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof StageFailure)
      return errorResponse(
        new HttpError(
          /timed out|cancelled/.test(error.message) ? 504 : 502,
          error.message,
        ),
      );
    return errorResponse(error);
  }
}
