// ABOUTME: Contract/failure recovery for provider-neutral model stages, without judging prose quality by keywords.
// ABOUTME: Tests distinguish a repaired candidate, provider silence, cancellation and an unapplied failure.
import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
  executeStage,
  StageFailure,
  type StageTrace,
} from "../src/agent/stage-runtime";
import type { AgentProvider } from "../src/agent/session";

const schema = z.object({ answer: z.string().min(1) }).strict();
function config(run: AgentProvider["run"]) {
  return {
    stage: "progress_review" as const,
    promptVersion: "test",
    instructions: "Submit through the tool.",
    context: { source: "fictional" },
    toolName: "present_review",
    toolDescription: "Submit a reviewed result.",
    schema,
    validate: () => [] as string[],
    provider: { name: "nebius" as const, model: "test", run },
  };
}
test("one specific schema repair is recorded and only the validated candidate is returned", async () => {
  const x = config(async (_i, _c, _t, handle) => {
    assert.equal(
      (await handle("present_review", { wrong: true })).status,
      "rejected",
    );
    assert.equal(
      (await handle("present_review", { answer: "Keep the current plan." }))
        .status,
      "ok",
    );
  });
  const r = await executeStage({ ...x, capturePayload: true });
  assert.equal(r.trace.submissions.length, 2);
  assert.ok(r.trace.submissions[0].issues.length);
  assert.equal(r.value.answer, "Keep the current plan.");
  assert.equal(r.trace.status, "completed");
});
test("provider silence and failure never become canned successful advice", async () => {
  await assert.rejects(executeStage(config(async () => {})), /did not submit/);
  let trace: StageTrace | undefined;
  await assert.rejects(
    executeStage({
      ...config(async () => {
        throw new Error("Provider unavailable.");
      }),
      onTrace: (t) => {
        trace = t;
      },
    }),
    StageFailure,
  );
  assert.equal(trace?.status, "failed");
  assert.equal(trace?.request, undefined);
});
test("a late result after cancellation cannot become current even if a provider ignores the signal", async () => {
  const controller = new AbortController();
  const x = config(async (_i, _c, _t, handle) => {
    await new Promise((r) => setTimeout(r, 15));
    await handle("present_review", { answer: "Late" });
  });
  const p = executeStage({ ...x, signal: controller.signal });
  controller.abort();
  await assert.rejects(p, /cancelled/);
});
test("extra tool names and a third submission cannot bypass bounded validation", async () => {
  await assert.rejects(
    executeStage(
      config(async (_i, _c, _t, h) => {
        await h("write_user_targets", {});
      }),
    ),
    /unregistered/,
  );
  await assert.rejects(
    executeStage(
      config(async (_i, _c, _t, h) => {
        await h("present_review", {});
        await h("present_review", {});
        await h("present_review", { answer: "Fourth try" });
      }),
    ),
    /one repair/,
  );
});
test("a pre-cancelled stage never starts inference or leaves an unhandled rejection", async () => {
  const c = new AbortController();
  c.abort();
  let calls = 0;
  await assert.rejects(
    executeStage({
      ...config(async () => {
        calls++;
      }),
      signal: c.signal,
    }),
    /cancelled/,
  );
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls, 0);
});
test("payload capture retains every usage event and the actual provider configuration", async () => {
  const c = config(async (_i, _c, _t, h, _s, observer) => {
    observer?.({
      kind: "configuration",
      value: { model: "synthetic", requestedThinking: false },
    });
    observer?.({ kind: "usage", value: { responseId: "first", tokens: 5 } });
    observer?.({ kind: "usage", value: { responseId: "second", tokens: 8 } });
    await h("present_review", { answer: "Keep the current plan." });
  });
  const { trace } = await executeStage({ ...c, capturePayload: true });
  assert.equal(trace.providerOutput?.usageEvents.length, 2);
  assert.deepEqual(trace.providerOutput?.configuration, {
    model: "synthetic",
    requestedThinking: false,
  });
});
test("usage metadata is available without retaining user-facing text or raw tool payloads", async () => {
  const c = config(async (_i, _c, _t, h, _s, observer) => {
    observer?.({
      kind: "usage",
      value: { responseId: "usage-only", tokens: 5 },
    });
    observer?.({ kind: "assistant_text", value: "Private user text" });
    observer?.({ kind: "tool_payload", value: { args: "Private user text" } });
    await h("present_review", { answer: "Keep the current plan." });
  });
  const { trace } = await executeStage(c);
  assert.equal(trace.providerOutput?.usageEvents.length, 1);
  assert.equal(trace.request, undefined);
  assert.equal(trace.providerOutput?.assistantText, "");
  assert.deepEqual(trace.providerOutput?.toolPayloads, []);
});
