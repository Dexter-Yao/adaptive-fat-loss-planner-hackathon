// ABOUTME: Real HTTP boundaries produce validated numbers without acquiring an AI provider.
import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../src/app/api/forecast/route";
import { ForecastResponseSchema } from "../src/domain/coach";
import { observation } from "./support/fixtures";
import { addDays } from "../src/domain/facts";
import { requestAt } from "./support/fixtures";
function request(value: unknown) {
  return new Request("http://127.0.0.1:3210/api/forecast", {
    method: "POST",
    headers: {
      origin: "http://127.0.0.1:3210",
      "content-type": "application/json",
    },
    body: JSON.stringify(value),
  });
}

test("numerical results are available with every AI credential and local provider disabled", async () => {
  const previous = process.env.AGENT_PROVIDER,
    secret = process.env.NEBIUS_API_KEY;
  process.env.AGENT_PROVIDER = "nebius";
  delete process.env.NEBIUS_API_KEY;
  try {
    const response = await POST(request(requestAt()));
    assert.equal(response.status, 200);
    const r = ForecastResponseSchema.parse(await response.json());
    assert.ok(r.forecast);
    assert.equal(r.provider, null);
    assert.equal(r.model, null);
    assert.equal(r.explanation, null);
    assert.deepEqual(r.toolCalls, []);
    assert.equal(r.forecast.modelResults.length, 3);
  } finally {
    if (previous === undefined) delete process.env.AGENT_PROVIDER;
    else process.env.AGENT_PROVIDER = previous;
    if (secret === undefined) delete process.env.NEBIUS_API_KEY;
    else process.env.NEBIUS_API_KEY = secret;
  }
});

test("invalid units, cross-origin requests and unknown fields cannot reach calculation", async () => {
  const r = requestAt();
  assert.equal(
    (await POST(request({ ...r, profile: { ...r.profile, weightKg: 76000 } })))
      .status,
    400,
  );
  assert.equal((await POST(request({ ...r, temperature: 0 }))).status, 400);
  const foreign = new Request("http://127.0.0.1:3210/api/forecast", {
    method: "POST",
    headers: { origin: "https://example.com" },
    body: JSON.stringify(r),
  });
  assert.equal((await POST(foreign)).status, 403);
  assert.equal(
    (
      await POST(
        new Request("http://127.0.0.1:3210/api/forecast", {
          method: "POST",
          body: " ".repeat(1_000_001),
        }),
      )
    ).status,
    413,
  );
});

test("a full supported year of structured records fits the shared bounded HTTP envelope", async () => {
  const r = requestAt();
  r.profile.startDate = "2025-01-01";
  r.asOfDate = addDays(r.profile.startDate, 330);
  r.goal.requestedDate = addDays(r.profile.startDate, 365);
  r.preferences.mealSchedules[0].effectiveFrom = r.profile.startDate;
  r.targetRevisions = [
    {
      ...r.targetRevisions[0],
      effectiveFrom: r.profile.startDate,
      targetDate: r.goal.requestedDate,
    },
  ];
  r.logs = Array.from({ length: 330 }, (_, i) =>
    observation(addDays(r.profile.startDate, i), {
      intake: {
        mode: "meals",
        entries: ["breakfast", "lunch", "dinner"].map((slotId) => ({
          slotId,
          status: "recorded",
          kcal: 650,
        })),
        extrasKcal: 0,
      },
      notes: "Fictional volume fixture. " + ".".repeat(250),
    }),
  );
  assert.ok(JSON.stringify(r).length > 100000);
  const response = await POST(request(r));
  assert.equal(response.status, 200);
  const result = ForecastResponseSchema.parse(await response.json());
  assert.equal(result.forecast!.modelResults[0].current.length, 366);
});

test("the shared byte limit also rejects multibyte bodies that are short by character count", async () => {
  const response = await POST(
    new Request("http://127.0.0.1:3210/api/forecast", {
      method: "POST",
      body: "你".repeat(340000),
    }),
  );
  assert.equal(response.status, 413);
});
