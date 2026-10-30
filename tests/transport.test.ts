// ABOUTME: Active journey transport rejects partial, malformed and failed responses without canned success.
// ABOUTME: Chunked UTF-8 is tested at the current JSON interface, replacing the retired NDJSON browser client.
import assert from "node:assert/strict";
import test from "node:test";
import { journeyHttpPorts } from "../src/application/journey-client";
import { journeyStageFixture } from "./support/journey-agent";
import { fictionalStage } from "./support/journey-fixtures";
const request = journeyStageFixture().request;
async function withResponse(
  response: () => Response,
  run: () => Promise<void>,
) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => response();
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}
test("chunked UTF-8 returns only the complete typed stage response", async () => {
  const result = fictionalStage(request),
    bytes = new TextEncoder().encode(JSON.stringify(result));
  await withResponse(
    () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (let i = 0; i < bytes.length; i += 17)
              controller.enqueue(bytes.slice(i, i + 17));
            controller.close();
          },
        }),
      ),
    async () =>
      assert.deepEqual(
        await journeyHttpPorts.stage(request, new AbortController().signal),
        result,
      ),
  );
});
test("incomplete stage output cannot replace a complete proposal", async () => {
  await withResponse(
    () => Response.json({ binding: request.binding, stage: "generate" }),
    async () => {
      await assert.rejects(
        journeyHttpPorts.stage(request, new AbortController().signal),
      );
    },
  );
});
test("malformed JSON and HTTP failures remain explicit", async () => {
  await withResponse(
    () => new Response("{"),
    async () => {
      await assert.rejects(
        journeyHttpPorts.stage(request, new AbortController().signal),
      );
    },
  );
  await withResponse(
    () =>
      Response.json(
        { error: "Model unavailable; measurements remain saved." },
        { status: 503 },
      ),
    async () => {
      await assert.rejects(
        journeyHttpPorts.stage(request, new AbortController().signal),
        /Model unavailable/,
      );
    },
  );
});
