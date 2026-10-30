// ABOUTME: Trace wrapper for the existing four-stage port; it cannot change model content, acceptance or state.
// ABOUTME: Browser routes pass no fictional identity; offline evaluators opt in explicitly and retain receipts.
import { StageRequestSchema, type StageResponse } from "../domain/workflow";
import { runModelStage } from "./stage-router";
import type { StageOptions } from "./stage-runtime";
import type { AgentProvider } from "./session";
import type { StageTrace } from "./stage-runtime";
import { exportStageTrace, type TraceOptions } from "./observability";

export async function runObservedStage(
  raw: unknown,
  provider: AgentProvider,
  options: StageOptions = {},
  tracing: TraceOptions = {},
): Promise<StageResponse> {
  const request = StageRequestSchema.parse(raw),
    startedAt = Date.now();
  const traces: StageTrace[] = [];
  let result: StageResponse | null = null;
  try {
    result = await runModelStage(request, provider, {
      ...options,
      capturePayload: Boolean(tracing.fictionalEval) || options.capturePayload,
      onTrace(trace) {
        traces.push(trace);
        options.onTrace?.(trace);
      },
    });
    return result;
  } finally {
    const receipt = await exportStageTrace(
      {
        request,
        result,
        traces,
        startedAt,
        endedAt: Date.now(),
        failed: result === null,
        project:
          (tracing.env ?? process.env).LANGSMITH_PROJECT ||
          "adaptive-fat-loss-planner",
      },
      tracing,
    );
    try {
      tracing.onExport?.(receipt);
    } catch {
      /* Reporting cannot replace the business result. */
    }
  }
}
