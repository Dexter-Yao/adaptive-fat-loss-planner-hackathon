// ABOUTME: Local evaluation reservations bound actual HTTP calls and conservatively reserve unknown usage.
// ABOUTME: Reported token estimates are not an invoice; reasoning is a subset of completion tokens, never added twice.
import { z } from "zod";

export const ModelPriceSchema = z.object({
  model: z.string().startsWith("nvidia/"),
  inputUsdPerMillion: z.number().nonnegative(),
  outputUsdPerMillion: z.number().nonnegative(),
});
export type ModelPrice = z.infer<typeof ModelPriceSchema>;
const Tokens = z.number().int().nonnegative();
const UsageSchema = z
  .object({
    prompt_tokens: Tokens,
    completion_tokens: Tokens,
    completion_tokens_details: z
      .object({ reasoning_tokens: Tokens.nullish() })
      .passthrough()
      .nullish(),
  })
  .passthrough();

/** Normalize known counters without inventing a reasoning split or zero-priced failures. */
export function reportedUsage(raw: unknown) {
  const parsed = UsageSchema.safeParse(raw);
  if (!parsed.success) return null;
  const u = parsed.data;
  const reasoning = u.completion_tokens_details?.reasoning_tokens ?? null;
  return {
    inputTokens: u.prompt_tokens,
    outputTokens: u.completion_tokens,
    reasoningTokens:
      reasoning !== null && reasoning <= u.completion_tokens ? reasoning : null,
  };
}
export interface BudgetCall {
  model: string;
  maxTokens: number;
  inputBytes: number;
  reservedUsd: number;
  responseId: string | null;
  returnedModel: string | null;
  finishReason: string | null;
  usage: ReturnType<typeof reportedUsage>;
  estimatedUsd: number | null;
}
export interface BudgetState {
  maxCalls: number;
  maxUsd: number;
  calls: BudgetCall[];
}

/** One explicit batch. Unknown attempts retain their full reservation until independently reconciled. */
export class InferenceBudget {
  readonly state: BudgetState;
  private readonly prices: Map<string, ModelPrice>;
  constructor(prices: ModelPrice[], state: BudgetState) {
    this.prices = new Map(
      prices.map((p) => [p.model, ModelPriceSchema.parse(p)]),
    );
    z.number().int().min(1).max(48).parse(state.maxCalls);
    z.number().positive().max(1).parse(state.maxUsd);
    this.state = structuredClone(state);
  }
  get committedUsd(): number {
    return this.state.calls.reduce(
      (n, c) => n + (c.estimatedUsd ?? c.reservedUsd),
      0,
    );
  }
  /** Reserve before transport. UTF-8 request bytes plus framing margin overestimate text tokens. */
  reserve(request: {
    model: string;
    maxTokens: number;
    inputBytes: number;
  }): number {
    const p = this.prices.get(request.model);
    if (!p)
      throw Error(
        "No verified price for this exact model; no inference attempted.",
      );
    Tokens.parse(request.inputBytes);
    Tokens.parse(request.maxTokens);
    const reservedUsd =
      ((request.inputBytes + 4096) * p.inputUsdPerMillion +
        request.maxTokens * p.outputUsdPerMillion) /
      1e6;
    if (
      this.state.calls.length >= this.state.maxCalls ||
      this.committedUsd + reservedUsd > this.state.maxUsd
    )
      throw Error(
        "The explicit evaluation call/dollar budget is exhausted; no further inference attempted.",
      );
    this.state.calls.push({
      ...request,
      reservedUsd,
      responseId: null,
      returnedModel: null,
      finishReason: null,
      usage: null,
      estimatedUsd: null,
    });
    return this.state.calls.length - 1;
  }
  /** Reconcile only a known receipt at its actual returned model's verified price. */
  settle(
    index: number,
    receipt: {
      model: string;
      responseId: string | null;
      finishReason: string | null;
      usage: unknown;
    },
  ): void {
    const call = this.state.calls[index];
    if (!call || call.returnedModel !== null)
      throw Error("Budget receipt does not identify one pending request.");
    const usage = reportedUsage(receipt.usage);
    const p = this.prices.get(receipt.model);
    Object.assign(call, {
      responseId: receipt.responseId,
      returnedModel: receipt.model,
      finishReason: receipt.finishReason,
      usage,
      estimatedUsd:
        usage && p
          ? (usage.inputTokens * p.inputUsdPerMillion +
              usage.outputTokens * p.outputUsdPerMillion) /
            1e6
          : null,
    });
    if (this.committedUsd > this.state.maxUsd)
      throw Error(
        "Reported usage exceeded the evaluation ceiling; stop the batch and inspect the receipt.",
      );
  }
}

/** Complete logical operation, including every rejected/truncated response; never just the final call. */
export function costSummary(calls: BudgetCall[]) {
  const known = calls.filter((c) => c.estimatedUsd !== null);
  const usages = calls.flatMap((c) => (c.usage ? [c.usage] : []));
  return {
    calls: calls.length,
    knownUsageCalls: usages.length,
    unknownBillingCalls: calls.length - known.length,
    inputTokens: usages.reduce((n, u) => n + u.inputTokens, 0),
    outputTokens: usages.reduce((n, u) => n + u.outputTokens, 0),
    reasoningTokens:
      usages.length === calls.length &&
      usages.every((u) => u.reasoningTokens !== null)
        ? usages.reduce((n, u) => n + u.reasoningTokens!, 0)
        : null,
    knownEstimatedUsd: known.reduce((n, c) => n + c.estimatedUsd!, 0),
    unknownReservedUsd: calls
      .filter((c) => c.estimatedUsd === null)
      .reduce((n, c) => n + c.reservedUsd, 0),
    billingVerified: false,
    cacheDiscountAssumed: false,
  };
}
