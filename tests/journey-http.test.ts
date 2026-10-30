// ABOUTME: New core HTTP requests remain validated, provider-independent and causally traceable.
// ABOUTME: The same byte/origin boundary guards old and journey calculation modes.
import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/forecast/route";
import { createSession } from "../src/application/session";
import {
  buildCalculationRequest,
  newBinding,
} from "../src/application/journey-commands";
import { CalculationResponseSchema } from "../src/domain/workflow";
import { fictionalInput, FIXTURE_DATE } from "./support/journey-fixtures";
function request(body: unknown, origin = "http://localhost:3211") {
  return new Request("http://localhost:3211/api/forecast", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
test("canonical journey calculation HTTP carries bindings, state policy and proposed rather than accepted targets", async () => {
  const x = fictionalInput(),
    s = createSession(x.profile, x.goal, x.preferences),
    input = buildCalculationRequest(s, newBinding(s, FIXTURE_DATE));
  const response = await POST(request(input));
  assert.equal(response.status, 200);
  const result = CalculationResponseSchema.parse(await response.json());
  assert.deepEqual(result.binding, input.binding);
  assert.equal(result.snapshot.provider, null);
  assert.equal(result.snapshot.model, null);
  assert.equal(
    result.snapshot.forecast!.conditioning!.assumptionMode,
    "accepted_plan",
  );
  assert.equal(result.snapshot.forecast!.coverage.totalMissingMeals, 0);
  assert.equal(s.targetRevisions.length, 0);
  assert.equal(result.proposedTargets.length, 1);
  assert.equal(
    (await POST(request({ ...input, overrideTdee: 5000 }))).status,
    400,
  );
  assert.equal((await POST(request(input, "https://example.com"))).status, 403);
  assert.equal(
    (
      await POST(
        request({ ...input, profile: { ...input.profile, weightKg: 72000 } }),
      )
    ).status,
    400,
  );
});
