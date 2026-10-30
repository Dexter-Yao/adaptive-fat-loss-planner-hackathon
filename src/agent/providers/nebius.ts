// ABOUTME: Nebius Token Factory Chat Completions adapter sharing the exact same business tools.
// ABOUTME: Keys stay server-side; unavailable inference never falls back to fabricated plan copy.
import type {
  AgentProvider,
  BusinessTool,
  ToolHandler,
  ProviderObserver,
} from "../session";
import { z } from "zod";

const ToolCallSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("function"),
    function: z
      .object({ name: z.string().min(1), arguments: z.string() })
      .passthrough(),
  })
  .passthrough();
const PayloadSchema = z
  .object({
    id: z.string().optional(),
    model: z.string().optional(),
    usage: z
      .object({
        prompt_tokens: z.number().optional(),
        completion_tokens: z.number().optional(),
        total_tokens: z.number().optional(),
      })
      .passthrough()
      .optional(),
    choices: z
      .array(
        z
          .object({
            finish_reason: z.string().nullable(),
            message: z
              .object({
                role: z.literal("assistant"),
                tool_calls: z.array(ToolCallSchema).nullish(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();
export interface NebiusReceipt {
  model: string;
  responseId: string | null;
  finishReason: string | null;
  usage: unknown;
}
export interface NebiusOptions {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  thinking?: boolean;
  /** Optional local-eval guard, invoked before each billable HTTP request, including repairs. */
  beforeRequest?: (request: {
    model: string;
    maxTokens: number;
    inputBytes: number;
  }) => void | ((receipt: NebiusReceipt) => void);
  /** Transport turns per tool stage; independent of the business validator's submission limit. */
  maxRequests?: number;
  onResponse?: (receipt: NebiusReceipt) => void;
}
/** One credential-destination boundary for inference and authenticated catalog inspection. */
export function tokenFactoryBaseUrl(raw: string): URL {
  const base = new URL(raw);
  if (
    base.protocol !== "https:" ||
    ![
      "api.tokenfactory.nebius.com",
      "api.tokenfactory.us-central1.nebius.com",
    ].includes(base.hostname) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error("Use an official HTTPS Nebius Token Factory endpoint.");
  return base;
}
export function nebiusProvider(options: NebiusOptions = {}): AgentProvider {
  const model =
    options.model ??
    process.env.NEBIUS_MODEL ??
    "deepseek-ai/DeepSeek-V4.1-Flash-1017";
  const config = {
    model,
    apiKey: options.apiKey ?? process.env.NEBIUS_API_KEY,
    baseUrl:
      options.baseUrl ??
      process.env.NEBIUS_BASE_URL ??
      "https://api.tokenfactory.nebius.com/v1",
    maxTokens: z
      .number()
      .int()
      .min(512)
      .max(16_384)
      .parse(options.maxTokens ?? 16_384),
    thinking:
      options.thinking ??
      (model.startsWith("Qwen/Qwen3.5") ||
      model === "nvidia/Nemotron-3_5-Lightning"
        ? false
        : undefined),
    onResponse: options.onResponse,
    beforeRequest: options.beforeRequest,
    maxRequests: z
      .number()
      .int()
      .min(1)
      .max(7)
      .parse(options.maxRequests ?? 7),
  };
  return {
    name: "nebius",
    model: config.model,
    run: (instructions, context, tools, handle, signal, observer) =>
      runNebius(instructions, context, tools, handle, signal, config, observer),
  };
}

async function runNebius(
  instructions: string,
  context: string,
  tools: BusinessTool[],
  handle: ToolHandler,
  signal: AbortSignal,
  config: {
    model: string;
    apiKey: string | undefined;
    baseUrl: string;
    maxTokens: number;
    thinking: boolean | undefined;
    onResponse: NebiusOptions["onResponse"];
    beforeRequest: NebiusOptions["beforeRequest"];
    maxRequests: number;
  },
  observer?: ProviderObserver,
): Promise<void> {
  signal.throwIfAborted();
  const key = config.apiKey;
  if (!key)
    throw new Error(
      "Nebius is not connected yet. Add NEBIUS_API_KEY on the server to enable live requests.",
    );
  const base = tokenFactoryBaseUrl(config.baseUrl);
  const messages: Record<string, unknown>[] = [
    {
      role: "system",
      content:
        instructions +
        "\nSubmit exactly one business-tool call per response. Do not emit multiple candidate calls together. After a rejected tool result, correct one complete candidate in the next response.",
    },
    { role: "user", content: context },
  ];
  observer?.({
    kind: "configuration",
    value: {
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: 0.2,
      requestedThinking: config.thinking ?? "provider_default",
    },
  });
  // Canonical stages have one terminal business tool: one candidate plus one repair.
  // Keep the older multi-tool orchestration's distinct transport allowance.
  const requestLimit =
    tools.length === 1 ? Math.min(config.maxRequests, 2) : config.maxRequests;
  for (let step = 0; step < requestLimit; step++) {
    const body = JSON.stringify({
      model: config.model,
      messages,
      tools: tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      })),
      tool_choice:
        tools.length === 1
          ? { type: "function", function: { name: tools[0].name } }
          : "auto",
      max_tokens: config.maxTokens,
      temperature: 0.2,
      parallel_tool_calls: false,
      ...(config.thinking === undefined
        ? {}
        : { chat_template_kwargs: { enable_thinking: config.thinking } }),
    });
    const settleRequest = config.beforeRequest?.({
      model: config.model,
      maxTokens: config.maxTokens,
      inputBytes: Buffer.byteLength(body, "utf8"),
    });
    const response = await fetch(
      base.toString().replace(/\/$/, "") + "/chat/completions",
      {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body,
      },
    );
    if (!response.ok) {
      let code: string | null = null,
        type: string | null = null;
      try {
        const error = (await response.json()).error;
        if (typeof error?.code === "string") code = error.code;
        if (typeof error?.type === "string") type = error.type;
      } catch {}
      observer?.({
        kind: "turn",
        value: {
          status: "http_error",
          httpStatus: response.status,
          code,
          type,
        },
      });
      if (code === "model_not_found")
        throw new Error(
          `The configured Nebius model ${config.model} is unavailable on this endpoint. No other model was substituted.`,
        );
      throw new Error(
        `Nebius request failed (${response.status}). Check model access, credits, and the server configuration.`,
      );
    }
    const raw: unknown = await response.json();
    const parsed = PayloadSchema.safeParse(raw);
    if (!parsed.success) {
      observer?.({
        kind: "turn",
        value: {
          status: "invalid_envelope",
          issues: parsed.error.issues.map((i) => ({
            path: i.path,
            message: i.message,
          })),
          keys: raw && typeof raw === "object" ? Object.keys(raw) : [],
        },
      });
      throw new Error("Nebius returned an invalid completion envelope.");
    }
    const payload = parsed.data;
    const receipt = {
      model: payload.model ?? config.model,
      responseId: payload.id ?? null,
      finishReason: payload.choices[0].finish_reason,
      usage: payload.usage ?? null,
    };
    settleRequest?.(receipt);
    config.onResponse?.(receipt);
    const message = payload.choices[0].message;
    observer?.({
      kind: "usage",
      value: {
        model: payload.model ?? config.model,
        responseId: payload.id ?? null,
        finishReason: payload.choices[0].finish_reason,
        usage: payload.usage ?? null,
      },
    });
    if (typeof message.content === "string")
      observer?.({ kind: "assistant_text", value: message.content });
    if (message.tool_calls)
      observer?.({
        kind: "tool_payload",
        value: {
          responseId: payload.id ?? null,
          finishReason: payload.choices[0].finish_reason,
          calls: message.tool_calls.map((call) => ({
            name: call.function.name,
            arguments: call.function.arguments.slice(0, 100_000),
          })),
        },
      });
    if (payload.choices[0].finish_reason === "length")
      throw new Error("Nebius returned an incomplete response. Please retry.");
    const calls = message.tool_calls;
    if (!calls?.length)
      throw new Error(
        "Nebius did not submit a registered business-tool result.",
      );
    if (
      calls.length > 8 ||
      calls.some(
        (call) => !tools.some((tool) => tool.name === call.function.name),
      )
    )
      throw new Error(
        "Nebius requested an unregistered tool or exceeded the tool budget.",
      );
    messages.push(message);
    if (tools.length === 1 && calls.length > 1) {
      for (const call of calls)
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            status: "rejected",
            issues: [
              "Submit exactly one complete tool call per response; this batch was not executed.",
            ],
          }),
        });
      continue;
    }
    let finalAccepted = false;
    for (const call of calls) {
      if (!tools.some((tool) => tool.name === call.function?.name))
        throw new Error("Nebius requested an unregistered tool.");
      let args: unknown;
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        throw new Error("Nebius returned invalid tool arguments.");
      }
      const result = await handle(call.function.name, args);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
      if (result.status === "rejected" && result.repairRemaining === 0)
        throw new Error(
          "The stage exhausted its bounded submission budget; retry explicitly.",
        );
      if (call.function.name === tools.at(-1)?.name && result.status === "ok")
        finalAccepted = true;
      else finalAccepted = false;
    }
    if (finalAccepted) return;
  }
  throw new Error(
    "The model did not finish within this turn's request budget.",
  );
}
