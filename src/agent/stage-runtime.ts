// ABOUTME: One provider-neutral, bounded structured-output stage with inspectable tool validation.
// ABOUTME: It owns no application state; private payload capture is opt-in for local fictional evals only.
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { AgentProvider, BusinessTool } from "./session";

export type StageName =
  | "interpretation"
  | "journey_generation"
  | "journey_revision"
  | "progress_review"
  | "plan_judgment";
export interface StageTrace {
  runId: string;
  requestId: string | null;
  stage: StageName;
  toolName: string;
  promptVersion: string;
  provider: AgentProvider["name"];
  model: string;
  startedAt: string;
  elapsedMs: number;
  contextHash: string;
  instructionsHash: string;
  schemaHash: string;
  status: "running" | "completed" | "failed";
  error: string | null;
  submissions: {
    atMs: number;
    issues: string[];
    args?: unknown;
    reply?: unknown;
  }[];
  request?: { instructions: string; context: unknown; tool: BusinessTool };
  providerOutput?: {
    assistantText: string;
    usage: unknown;
    usageEvents: { atMs: number; value: unknown }[];
    turnStatus: unknown;
    configuration: unknown;
    toolPayloads: unknown[];
  };
}
/** Shared invocation controls, independent of any business stage's content implementation. */
export interface StageOptions {
  signal?: AbortSignal;
  capturePayload?: boolean;
  onTrace?: (trace: StageTrace) => void;
  requestId?: string;
}

export class StageFailure extends Error {
  constructor(
    message: string,
    public readonly trace: StageTrace,
  ) {
    super(message);
    this.name = "StageFailure";
  }
}
export const contentHash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Validate the model's candidate before acknowledging success; never apply it to a session. */
export async function executeStage<T>(config: {
  stage: StageName;
  promptVersion: string;
  instructions: string;
  context: unknown;
  toolName: string;
  toolDescription: string;
  schema: z.ZodType<T>;
  validate: (value: T) => string[];
  provider: AgentProvider;
  timeoutMs?: number;
  maxSubmissions?: number;
  signal?: AbortSignal;
  capturePayload?: boolean;
  onTrace?: (trace: StageTrace) => void;
  requestId?: string;
}): Promise<{ value: T; trace: StageTrace }> {
  const started = Date.now();
  const maxSubmissions = z
    .number()
    .int()
    .min(1)
    .max(4)
    .parse(config.maxSubmissions ?? 2);
  const { $schema: _dialect, ...inputSchema } = z.toJSONSchema(config.schema);
  const tool: BusinessTool = {
    name: config.toolName,
    description: config.toolDescription,
    inputSchema,
  };
  const trace: StageTrace = {
    runId: randomUUID(),
    requestId: config.requestId ?? null,
    stage: config.stage,
    toolName: config.toolName,
    promptVersion: config.promptVersion,
    provider: config.provider.name,
    model: config.provider.model,
    startedAt: new Date(started).toISOString(),
    elapsedMs: 0,
    contextHash: contentHash(config.context),
    instructionsHash: contentHash(config.instructions),
    schemaHash: contentHash(inputSchema),
    status: "running",
    error: null,
    submissions: [],
  };
  if (config.capturePayload)
    trace.request = {
      instructions: config.instructions,
      context: config.context,
      tool,
    };
  const signal = AbortSignal.any([
    AbortSignal.timeout(config.timeoutMs ?? 120_000),
    ...(config.signal ? [config.signal] : []),
  ]);
  let candidate: { value: T } | null = null;
  let abortListener: (() => void) | undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abortListener = () =>
      reject(
        new Error(
          "The AI stage timed out or was cancelled; no result was applied.",
        ),
      );
    signal.addEventListener("abort", abortListener, { once: true });
  });
  try {
    signal.throwIfAborted();
    await Promise.race([
      config.provider.run(
        config.instructions,
        JSON.stringify(config.context),
        [tool],
        async (name, args) => {
          signal.throwIfAborted();
          candidate = null;
          if (name !== tool.name)
            throw new Error(
              "The provider requested an unregistered stage tool.",
            );
          if (trace.submissions.length >= maxSubmissions)
            throw new Error(
              maxSubmissions === 2
                ? "The stage used its candidate and one repair; retry explicitly."
                : "The stage exhausted its bounded submission budget; retry explicitly.",
            );
          const parsed = config.schema.safeParse(args);
          const issues = parsed.success
            ? config.validate(parsed.data)
            : parsed.error.issues.map(
                (i) => `${i.path.join(".")}: ${i.message}`,
              );
          const reply = issues.length
            ? {
                status: "rejected",
                issues: issues.slice(0, 8),
                repairRemaining: maxSubmissions - 1 - trace.submissions.length,
              }
            : { status: "ok" };
          trace.submissions.push({
            atMs: Date.now() - started,
            issues,
            ...(config.capturePayload ? { args, reply } : {}),
          });
          if (parsed.success && !issues.length)
            candidate = { value: parsed.data };
          return reply;
        },
        signal,
        (event) => {
          if (
            !config.capturePayload &&
            (event.kind === "assistant_text" || event.kind === "tool_payload")
          )
            return;
          trace.providerOutput ??= {
            assistantText: "",
            usage: null,
            usageEvents: [],
            turnStatus: null,
            configuration: null,
            toolPayloads: [],
          };
          if (
            event.kind === "assistant_text" &&
            typeof event.value === "string"
          )
            trace.providerOutput.assistantText = (
              trace.providerOutput.assistantText + event.value
            ).slice(-6000);
          else if (event.kind === "usage") {
            trace.providerOutput.usage = event.value;
            trace.providerOutput.usageEvents.push({
              atMs: Date.now() - started,
              value: event.value,
            });
          } else if (event.kind === "turn")
            trace.providerOutput.turnStatus = event.value;
          else if (event.kind === "configuration")
            trace.providerOutput.configuration = event.value;
          else if (event.kind === "tool_payload")
            trace.providerOutput.toolPayloads.push(event.value);
        },
      ),
      cancelled,
    ]);
    signal.throwIfAborted();
    if (!candidate)
      throw new Error(
        "The model did not submit a validated stage result; the user's saved data is unchanged.",
      );
    trace.status = "completed";
    return { value: (candidate as { value: T }).value, trace };
  } catch (error) {
    trace.status = "failed";
    trace.error = signal.aborted
      ? "The AI stage timed out or was cancelled; no result was applied."
      : error instanceof Error
        ? error.message
        : "The AI stage failed.";
    throw new StageFailure(trace.error, trace);
  } finally {
    if (abortListener) signal.removeEventListener("abort", abortListener);
    trace.elapsedMs = Date.now() - started;
    config.onTrace?.(trace);
  }
}
