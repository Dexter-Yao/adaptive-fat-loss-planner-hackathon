// ABOUTME: Dollar/call boundaries include repairs and unknown attempts, independently of model quality.
// ABOUTME: Synthetic token receipts test accounting only, with no external inference.
import assert from "node:assert/strict";
import test from "node:test";
import {
  InferenceBudget,
  costSummary,
  reportedUsage,
} from "../src/evaluation/inference-budget";
const price = {
  model: "nvidia/test",
  inputUsdPerMillion: 1,
  outputUsdPerMillion: 3,
};
test("unknown attempts consume reservations and block a further request before transport", () => {
  const b = new InferenceBudget([price], {
    maxCalls: 3,
    maxUsd: 0.02,
    calls: [],
  });
  b.reserve({ model: price.model, inputBytes: 1000, maxTokens: 1000 });
  b.reserve({ model: price.model, inputBytes: 1000, maxTokens: 1000 });
  assert.throws(
    () => b.reserve({ model: price.model, inputBytes: 1000, maxTokens: 1000 }),
    /budget is exhausted/,
  );
  assert.equal(costSummary(b.state.calls).unknownBillingCalls, 2);
  assert.equal(costSummary(b.state.calls).knownEstimatedUsd, 0);
  assert.ok(costSummary(b.state.calls).unknownReservedUsd > 0);
});
test("rejected and length-limited completions remain charged; reasoning is not added twice", () => {
  const b = new InferenceBudget([price], { maxCalls: 2, maxUsd: 1, calls: [] });
  const first = b.reserve({
    model: price.model,
    inputBytes: 1000,
    maxTokens: 512,
  });
  const second = b.reserve({
    model: price.model,
    inputBytes: 2000,
    maxTokens: 512,
  });
  b.settle(second, {
    model: price.model,
    responseId: "second",
    finishReason: "tool_calls",
    usage: {
      prompt_tokens: 200,
      completion_tokens: 100,
      completion_tokens_details: { reasoning_tokens: 40 },
    },
  });
  b.settle(first, {
    model: price.model,
    responseId: "first",
    finishReason: "length",
    usage: {
      prompt_tokens: 100,
      completion_tokens: 100,
      completion_tokens_details: { reasoning_tokens: 50 },
    },
  });
  const sum = costSummary(b.state.calls);
  assert.equal(sum.knownEstimatedUsd, 0.0009);
  assert.equal(sum.reasoningTokens, 90);
  assert.equal(sum.outputTokens, 200);
  assert.equal(b.state.calls[first].responseId, "first");
  assert.throws(
    () => b.reserve({ model: price.model, inputBytes: 1, maxTokens: 512 }),
    /budget is exhausted/,
  );
  assert.equal(reportedUsage({ prompt_tokens: 10 }), null);
  assert.equal(
    reportedUsage({ prompt_tokens: 10, completion_tokens: 5 })?.reasoningTokens,
    null,
  );
  assert.deepEqual(
    reportedUsage({
      prompt_tokens: 10,
      completion_tokens: 5,
      completion_tokens_details: null,
      prompt_tokens_details: null,
    }),
    { inputTokens: 10, outputTokens: 5, reasoningTokens: null },
  );
});
test("unpriced models and a substituted unpriced response do not become a zero-cost completion", () => {
  const b = new InferenceBudget([price], { maxCalls: 2, maxUsd: 1, calls: [] });
  assert.throws(
    () =>
      b.reserve({ model: "nvidia/unpriced", inputBytes: 1, maxTokens: 512 }),
    /verified price/,
  );
  const i = b.reserve({ model: price.model, inputBytes: 100, maxTokens: 512 });
  b.settle(i, {
    model: "nvidia/unpriced",
    responseId: "unexpected",
    finishReason: "tool_calls",
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  });
  assert.equal(costSummary(b.state.calls).unknownBillingCalls, 1);
  assert.ok(b.committedUsd > 0);
});
