// ABOUTME: Actual journey HTTP parsing/dispatch with synthetic Nebius responses; no external inference is made.
// ABOUTME: Successful tool output, origin/size guards and unavailable/cancelled provider errors stay distinct.
import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../src/app/api/journey/route";
import { generationInput } from "../src/agent/stage-router";
import { StageResponseSchema } from "../src/domain/workflow";
import { MAX_JSON_BYTES } from "../src/server/http";
import {
  journeyStageFixture,
  syntheticJourney,
  syntheticGuidanceContent,
} from "./support/journey-agent";

function request(
  body: unknown,
  origin = "http://localhost:3212",
  signal?: AbortSignal,
) {
  return new Request("http://localhost:3212/api/journey", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}
test("journey HTTP preserves the canonical result and exposes actual provider failures without a fallback", async () => {
  const saved = globalThis.fetch,
    env = {
      AGENT_PROVIDER: process.env.AGENT_PROVIDER,
      NEBIUS_API_KEY: process.env.NEBIUS_API_KEY,
      PUBLIC_DEMO_ENABLED: process.env.PUBLIC_DEMO_ENABLED,
    };
  process.env.AGENT_PROVIDER = "nebius";
  process.env.NEBIUS_API_KEY = "fictional-http-test-key";
  process.env.PUBLIC_DEMO_ENABLED = "true";
  const r = journeyStageFixture().request;
  try {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json({
        id: "synthetic-response",
        model: "synthetic",
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              tool_calls: [
                {
                  id: "synthetic-call",
                  type: "function",
                  function: {
                    name: "present_journey",
                    arguments: JSON.stringify(
                      syntheticGuidanceContent(
                        syntheticJourney(generationInput(r)),
                      ),
                    ),
                  },
                },
              ],
            },
          },
        ],
      });
    };
    const success = await POST(request(r));
    assert.equal(success.status, 200);
    assert.deepEqual(
      StageResponseSchema.parse(await success.json()).binding,
      r.binding,
    );
    assert.equal(success.headers.get("Cache-Control"), "no-store");
    assert.equal(calls, 1);
    assert.equal(
      (await POST(request(r, "https://different.invalid"))).status,
      403,
    );
    assert.equal((await POST(request("x".repeat(MAX_JSON_BYTES)))).status, 413);
    assert.equal(calls, 1);
    delete process.env.NEBIUS_API_KEY;
    assert.equal((await POST(request(r))).status, 503);
    assert.equal(calls, 1);
    process.env.NEBIUS_API_KEY = "fictional-http-test-key";
    globalThis.fetch = async () =>
      new Response("Synthetic provider unavailable", { status: 503 });
    const failed = await POST(request(r));
    assert.equal(failed.status, 502);
    assert.match((await failed.json()).error, /Nebius request failed/);
    const controller = new AbortController();
    controller.abort();
    assert.equal(
      (await POST(request(r, "http://localhost:3212", controller.signal)))
        .status,
      504,
    );
  } finally {
    globalThis.fetch = saved;
    for (const [k, v] of Object.entries(env))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
});
