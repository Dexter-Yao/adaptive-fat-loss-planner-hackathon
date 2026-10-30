// ABOUTME: One explicit LangSmith export boundary using the official SDK and metadata-only browser traces.
// ABOUTME: Full content requires a trusted local fictional-eval identity; transport failure never changes a model result.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Client } from "langsmith";
import { convertToDottedOrderFormat } from "langsmith/run_trees";
import type { RunCreate } from "langsmith/schemas";
import type { StageRequest, StageResponse } from "../domain/workflow";
import { EvalIdentitySchema, type EvalIdentity } from "../evaluation/contracts";
import type { StageTrace } from "./stage-runtime";

type TraceWriter = Pick<Client, "batchIngestRuns">;
export interface TraceExport {
  status: "disabled" | "submitted" | "failed" | "unconfirmed";
  runId: string | null;
  stages: number;
  content: "metadata" | "fictional";
}
export interface TraceOptions {
  env?: Record<string, string | undefined>;
  client?: TraceWriter;
  fictionalEval?: EvalIdentity;
  onExport?: (receipt: TraceExport) => void;
  exportTimeoutMs?: number;
}
const endpoints = new Set([
  "api.smith.langchain.com",
  "eu.api.smith.langchain.com",
  "apac.api.smith.langchain.com",
  "aws.api.smith.langchain.com",
]);
export function langSmithClient(
  env: Record<string, string | undefined> = process.env,
  options: { timeoutMs?: number } = {},
): Client {
  const endpoint = new URL(
    env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com",
  );
  if (
    endpoint.protocol !== "https:" ||
    !endpoints.has(endpoint.hostname) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    (endpoint.pathname !== "/" && endpoint.pathname !== "")
  )
    throw new Error("Use an official LangSmith HTTPS API endpoint.");
  if (!env.LANGSMITH_API_KEY) throw new Error("LangSmith is not configured.");
  return new Client({
    apiUrl: endpoint.origin,
    apiKey: env.LANGSMITH_API_KEY,
    workspaceId: env.LANGSMITH_WORKSPACE_ID,
    timeout_ms: z
      .number()
      .int()
      .min(500)
      .max(15_000)
      .parse(options.timeoutMs ?? 2000),
    callerOptions: { maxRetries: 0 },
    autoBatchTracing: false,
    omitTracedRuntimeInfo: true,
    debug: false,
  });
}
function usage(trace: StageTrace) {
  const sum = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  let found = false;
  for (const event of trace.providerOutput?.usageEvents ?? []) {
    const value = event.value as Record<string, unknown> | null;
    const u = (value?.usage ?? value) as Record<string, unknown> | null;
    for (const [name, aliases] of Object.entries({
      input_tokens: ["prompt_tokens", "input_tokens"],
      output_tokens: ["completion_tokens", "output_tokens"],
      total_tokens: ["total_tokens"],
    })) {
      const n = aliases
        .map((key) => u?.[key])
        .find((v) => typeof v === "number" && Number.isFinite(v) && v >= 0);
      if (typeof n === "number") {
        sum[name as keyof typeof sum] += n;
        found = true;
      }
    }
  }
  return found ? sum : null;
}
const ConfigurationSchema = z.object({
  model: z.string().max(200).optional(),
  maxTokens: z.number().int().optional(),
  temperature: z.number().optional(),
  requestedThinking: z
    .union([z.boolean(), z.literal("provider_default")])
    .optional(),
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
});
/** Whitelist counters/hashes, never error messages, validator quotations or arbitrary provider envelopes. */
export function traceSummary(trace: StageTrace) {
  const configuration = ConfigurationSchema.safeParse(
    trace.providerOutput?.configuration,
  );
  const responses = (trace.providerOutput?.usageEvents ?? []).flatMap(
    (event) => {
      const value = event.value as Record<string, unknown> | null;
      return typeof value?.model === "string" &&
        /^[\w./-]{1,200}$/.test(value.model)
        ? [
            {
              atMs: event.atMs,
              model: value.model,
              responseId:
                typeof value.responseId === "string" &&
                /^[\w.:-]{1,200}$/.test(value.responseId)
                  ? value.responseId
                  : null,
              finishReason: [
                "tool_calls",
                "stop",
                "length",
                "content_filter",
              ].includes(String(value.finishReason))
                ? value.finishReason
                : null,
            },
          ]
        : [];
    },
  );
  return {
    stage: trace.stage,
    operation: trace.toolName,
    status: trace.status,
    elapsedMs: trace.elapsedMs,
    submissions: trace.submissions.length,
    rejectedSubmissions: trace.submissions.filter((s) => s.issues.length > 0)
      .length,
    usage: usage(trace),
    configuration: configuration.success ? configuration.data : null,
    responses,
  };
}
export function traceRuns(args: {
  request: StageRequest;
  result: StageResponse | null;
  traces: StageTrace[];
  startedAt: number;
  endedAt: number;
  failed: boolean;
  project: string;
  identity?: EvalIdentity;
}): RunCreate[] {
  const rootId = randomUUID();
  const rootOrder = convertToDottedOrderFormat(
    args.startedAt,
    rootId,
  ).dottedOrder;
  const raw = Boolean(args.identity);
  const metadata = {
    requestId: args.request.binding.requestId,
    operation: args.request.stage,
    content: raw ? "fictional" : "metadata",
    ...(args.identity ?? {}),
  };
  const parent: RunCreate = {
    id: rootId,
    name: `adaptive.${args.request.stage}`,
    run_type: "chain",
    session_name: args.project,
    trace_id: rootId,
    dotted_order: rootOrder,
    start_time: args.startedAt,
    end_time: args.endedAt,
    inputs: raw ? { request: args.request } : { operation: args.request.stage },
    outputs: {
      status: args.failed ? "failed" : "completed",
      stages: args.traces.map(traceSummary),
      ...(raw ? { result: args.result } : {}),
    },
    ...(args.failed ? { error: "stage_failed_or_cancelled" } : {}),
    extra: { metadata },
    tags: ["adaptive", raw ? "fictional-eval" : "metadata-only"],
  };
  return [
    parent,
    ...args.traces.map(
      (trace): RunCreate => ({
        id: trace.runId,
        name: `${trace.stage}.${trace.toolName}`,
        run_type: "chain",
        session_name: args.project,
        parent_run_id: rootId,
        trace_id: rootId,
        dotted_order: `${rootOrder}.${convertToDottedOrderFormat(Date.parse(trace.startedAt), trace.runId).dottedOrder}`,
        start_time: Date.parse(trace.startedAt),
        end_time: Date.parse(trace.startedAt) + trace.elapsedMs,
        inputs:
          raw && trace.request
            ? trace.request
            : {
                contextHash: trace.contextHash,
                instructionsHash: trace.instructionsHash,
                schemaHash: trace.schemaHash,
              },
        outputs: {
          ...traceSummary(trace),
          ...(raw
            ? {
                submissions: trace.submissions,
                providerOutput: trace.providerOutput,
              }
            : {}),
        },
        ...(trace.status === "failed"
          ? { error: "stage_failed_or_cancelled" }
          : {}),
        extra: {
          metadata: {
            ...metadata,
            model: trace.model,
            provider: trace.provider,
            promptVersion: trace.promptVersion,
            operation: trace.toolName,
          },
        },
      }),
    ),
  ];
}
export async function exportStageTrace(
  args: Parameters<typeof traceRuns>[0],
  options: TraceOptions = {},
): Promise<TraceExport> {
  const env = options.env ?? process.env;
  const receipt: TraceExport = {
    status: "disabled",
    runId: null,
    stages: args.traces.length,
    content: options.fictionalEval ? "fictional" : "metadata",
  };
  if (env.LANGSMITH_TRACING !== "true") return receipt;
  try {
    const identity = options.fictionalEval
      ? EvalIdentitySchema.parse(options.fictionalEval)
      : undefined;
    if (identity && env.NODE_ENV === "production")
      throw new Error("Fictional content capture is local-only.");
    const client = options.client ?? langSmithClient(env);
    const runs = traceRuns({ ...args, identity });
    receipt.runId = runs[0].id ?? null;
    const budget = z
      .number()
      .int()
      .min(5)
      .max(5000)
      .parse(options.exportTimeoutMs ?? 3000);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        client
          .batchIngestRuns({ runCreates: runs })
          .then(() => "submitted" as const),
        new Promise<"unconfirmed">((resolve) => {
          timer = setTimeout(() => resolve("unconfirmed"), budget);
        }),
      ]);
      // The SDK may complete later; timeout is unknown delivery, never a confirmed rejection or success.
      receipt.status = outcome;
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    receipt.status = "failed";
  }
  return receipt;
}
