// ABOUTME: Protect explicit stage routing, trace privacy and unmodified success/failure semantics.
// ABOUTME: Providers and transport are synthetic here; live readback is a separate operational check.
import assert from "node:assert/strict";
import test from "node:test";
import type { RunCreate } from "langsmith/schemas";
import { stageModelConfiguration } from "../src/agent/model-routing";
import { runObservedStage } from "../src/agent/observed-stage";
import { langSmithClient, type TraceExport } from "../src/agent/observability";
import {
  EvalIdentitySchema,
  HumanAnnotationSchema,
} from "../src/evaluation/contracts";
import {
  journeyStageFixture,
  syntheticJourney,
  syntheticGuidanceContent,
} from "./support/journey-agent";
import { generationInput } from "../src/agent/stage-router";
import type { AgentProvider } from "../src/agent/session";

const identity = EvalIdentitySchema.parse({
  caseId: "foundation-smoke",
  datasetVersion: "synthetic-v1",
  experimentId: "foundation",
  split: "exploration",
  dataClass: "fictional",
});
const env = { LANGSMITH_TRACING: "true", LANGSMITH_PROJECT: "adaptive-tests" };
function provider(request = journeyStageFixture().request): AgentProvider {
  return {
    name: "nebius",
    model: "synthetic-no-inference",
    async run(_instructions, _context, tools, handler, _signal, observe) {
      observe?.({
        kind: "usage",
        value: {
          usage: { prompt_tokens: 21, completion_tokens: 13, total_tokens: 34 },
          model: "synthetic-returned-model",
          privateValue: "provider-secret",
        },
      });
      observe?.({ kind: "assistant_text", value: "private-assistant-text" });
      assert.equal(
        (
          await handler(
            tools[0].name,
            syntheticGuidanceContent(
              syntheticJourney(generationInput(request)),
            ),
          )
        ).status,
        "ok",
      );
    },
  };
}
function sink(fail = false) {
  const runs: RunCreate[] = [];
  return {
    runs,
    async batchIngestRuns(batch: { runCreates?: RunCreate[] }) {
      if (fail)
        throw new Error("credential-and-private-response-must-not-escape");
      runs.push(...(batch.runCreates ?? []));
    },
  };
}
test("per-stage routes preserve baseline, stay independent and reject invalid overrides", () => {
  const config = {
    NEBIUS_MODEL: "baseline",
    NEBIUS_INTERPRET_MODEL: "nvidia/nano",
    NEBIUS_GENERATE_MODEL: "nvidia/super",
    NEBIUS_GENERATE_THINKING: "on",
    NEBIUS_GENERATE_MAX_TOKENS: "8192",
  };
  assert.deepEqual(stageModelConfiguration({}, "interpret"), {});
  assert.deepEqual(stageModelConfiguration(config, "interpret"), {
    model: "nvidia/nano",
  });
  assert.deepEqual(stageModelConfiguration(config, "generate"), {
    model: "nvidia/super",
    thinking: true,
    maxTokens: 8192,
  });
  assert.deepEqual(stageModelConfiguration(config, "review_progress"), {
    model: "baseline",
  });
  assert.throws(() =>
    stageModelConfiguration({ NEBIUS_REVISE_THINKING: "maybe" }, "revise"),
  );
  assert.throws(() =>
    stageModelConfiguration(
      { NEBIUS_GENERATE_MAX_TOKENS: "999999" },
      "generate",
    ),
  );
  assert.throws(() =>
    stageModelConfiguration(
      { NEBIUS_MODEL: "https://arbitrary-host?token=secret" },
      "generate",
    ),
  );
});
test("browser-style tracing exports only whitelisted metadata with actual stage hierarchy", async () => {
  const r = journeyStageFixture().request,
    writer = sink();
  let receipt: TraceExport | undefined;
  const result = await runObservedStage(
    r,
    provider(r),
    {},
    {
      env,
      client: writer,
      onExport: (x) => {
        receipt = x;
      },
    },
  );
  assert.deepEqual(result.binding, r.binding);
  assert.equal(receipt?.status, "submitted");
  assert.equal(writer.runs[1].outputs?.usage.total_tokens, 34);
  assert.equal(writer.runs.length, 2);
  const [root, child] = writer.runs;
  assert.equal(child.parent_run_id, root.id);
  assert.equal(child.trace_id, root.id);
  assert.ok(child.dotted_order?.startsWith(root.dotted_order + "."));
  assert.equal(child.name, "journey_generation.present_journey");
  assert.deepEqual(child.outputs?.usage, {
    input_tokens: 21,
    output_tokens: 13,
    total_tokens: 34,
  });
  assert.equal(child.outputs?.responses[0].model, "synthetic-returned-model");
  const wire = JSON.stringify(writer.runs);
  for (const privateText of [
    r.preferences.context,
    "private-assistant-text",
    "provider-secret",
    "sourceId",
    "profile",
    "quote",
  ]) {
    if (privateText)
      assert.equal(wire.includes(privateText), false, privateText);
  }
  assert.equal(root.extra?.metadata.content, "metadata");
});
test("tracing is off without the explicit flag and export/reporting failure cannot replace success", async () => {
  const r = journeyStageFixture().request,
    writer = sink();
  await runObservedStage(r, provider(r), {}, { env: {}, client: writer });
  assert.equal(writer.runs.length, 0);
  let receipt: TraceExport | undefined;
  const result = await runObservedStage(
    r,
    provider(r),
    {},
    {
      env,
      client: sink(true),
      onExport: (x) => {
        receipt = x;
        throw Error("reporter failed");
      },
    },
  );
  assert.equal(result.stage, "generate");
  assert.equal(receipt?.status, "failed");
});
test("a real stage failure remains failed while its trace omits raw error details", async () => {
  const r = journeyStageFixture().request,
    writer = sink();
  const broken: AgentProvider = {
    name: "nebius",
    model: "synthetic",
    async run() {
      throw Error("sensitive failure text");
    },
  };
  await assert.rejects(
    runObservedStage(r, broken, {}, { env, client: writer }),
    /sensitive failure text/,
  );
  assert.equal(writer.runs[0].outputs?.status, "failed");
  assert.equal(writer.runs[1].error, "stage_failed_or_cancelled");
  assert.equal(
    JSON.stringify(writer.runs).includes("sensitive failure text"),
    false,
  );
});
test("a stalled trace transport has bounded foreground wait without claiming failed or delivered ingestion", async () => {
  const r = journeyStageFixture().request;
  let receipt: TraceExport | undefined;
  const result = await runObservedStage(
    r,
    provider(r),
    {},
    {
      env,
      exportTimeoutMs: 5,
      client: { batchIngestRuns: () => new Promise<void>(() => {}) },
      onExport: (x) => {
        receipt = x;
      },
    },
  );
  assert.equal(result.stage, "generate");
  assert.equal(receipt?.status, "unconfirmed");
});
test("full evaluable content needs a trusted fictional identity and production refuses it", async () => {
  const r = journeyStageFixture().request,
    writer = sink();
  await runObservedStage(
    r,
    provider(r),
    {},
    { env, client: writer, fictionalEval: identity },
  );
  assert.equal(writer.runs[0].extra?.metadata.caseId, identity.caseId);
  assert.equal(writer.runs[0].extra?.metadata.dataClass, "fictional");
  assert.deepEqual(writer.runs[0].inputs?.request, r);
  assert.ok(writer.runs[1].inputs?.instructions);
  assert.ok(writer.runs[1].outputs?.submissions);
  const blocked = sink();
  let receipt: TraceExport | undefined;
  await runObservedStage(
    r,
    provider(r),
    {},
    {
      env: { ...env, NODE_ENV: "production" },
      client: blocked,
      fictionalEval: identity,
      onExport: (x) => {
        receipt = x;
      },
    },
  );
  assert.equal(blocked.runs.length, 0);
  assert.equal(receipt?.status, "failed");
});
test("endpoints and annotation boundaries reject unsafe or invented records", () => {
  for (const endpoint of [
    "http://api.smith.langchain.com",
    "https://api.smith.langchain.com.evil.example",
    "https://a:b@api.smith.langchain.com",
    "https://api.smith.langchain.com/?secret=1",
  ]) {
    assert.throws(() =>
      langSmithClient({
        LANGSMITH_API_KEY: "test",
        LANGSMITH_ENDPOINT: endpoint,
      }),
    );
  }
  assert.equal(
    EvalIdentitySchema.safeParse({ ...identity, dataClass: "personal" })
      .success,
    false,
  );
  assert.equal(
    HumanAnnotationSchema.safeParse({ caseId: "x", verdict: "pass" }).success,
    false,
  );
});
