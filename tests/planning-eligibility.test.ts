// ABOUTME: Self-guided scope cannot be bypassed by UI, a model assessment or direct stage calls.
// ABOUTME: Existing saved profiles remain readable; supported does not mean medically cleared.
import assert from "node:assert/strict";
import test from "node:test";
import { assessPlanningEligibility } from "../src/domain/planning-eligibility";
import { ProfileFactsSchema } from "../src/domain/facts";
import { enforceContext } from "../src/domain/context";
import { reviewInitialization } from "../src/agent/initialize";
import { runModelStage } from "../src/agent/stage-router";
import { evaluatePlanning } from "../src/planning/evaluate";
import { exampleRequest } from "../src/domain/example";
import { journeyStageFixture } from "./support/journey-agent";
import { fictionalInput, journeyHarness } from "./support/journey-fixtures";
import type { AgentProvider } from "../src/agent/session";

test("adult population limits and health answers have one deterministic owner", () => {
  assert.equal(
    assessPlanningEligibility({
      ageYears: null,
      eligibility: "clinical_guidance",
    }).supported,
    false,
  );
  assert.match(
    assessPlanningEligibility({
      ageYears: null,
      eligibility: "clinical_guidance",
    }).message!,
    /individual advice/,
  );
  for (const ageYears of [18, 36, 64])
    assert.equal(
      assessPlanningEligibility({ ageYears, eligibility: "standard" })
        .supported,
      true,
    );
  for (const ageYears of [12, 17, 65, 85])
    assert.equal(
      assessPlanningEligibility({ ageYears, eligibility: "standard" })
        .supported,
      false,
    );
  for (const eligibility of [
    "pregnant_or_breastfeeding",
    "clinical_guidance",
  ] as const)
    assert.equal(
      assessPlanningEligibility({ ageYears: 36, eligibility }).supported,
      false,
    );
  const p = { ...exampleRequest("2026-10-01").profile, ageYears: 85 };
  assert.equal(
    ProfileFactsSchema.safeParse(p).success,
    true,
    "Historical profiles remain readable; support is a policy boundary, not destructive migration.",
  );
});
test("out-of-scope facts withhold numerical planning even when a model proposes standard applicability", () => {
  const request = exampleRequest("2026-10-01");
  request.profile.ageYears = 65;
  const c = enforceContext(request, {
    applicability: "standard",
    reason: null,
    constraints: [],
    signals: [],
  });
  assert.equal(c.applicability, "unsupported");
  assert.ok(
    c.signals.some((s) =>
      s.evidence.some(
        (e) => e.sourceId === "profile.ageYears" && e.quote === "65",
      ),
    ),
  );
  const result = evaluatePlanning(request);
  assert.equal(result.forecast, null);
  assert.equal(result.decision.code, "scope");
});
test("screening rejects before storing new setup or calling any model", async () => {
  const input = fictionalInput();
  input.profile.eligibility = "clinical_guidance";
  const h = journeyHarness();
  await assert.rejects(h.controller.start(input), /not suitable/);
  assert.equal(h.access.read(), null);
  assert.equal(h.storage.values.size, 0);
  let calls = 0;
  const provider: AgentProvider = {
    name: "nebius",
    model: "synthetic-unit",
    async run() {
      calls++;
    },
  };
  await assert.rejects(reviewInitialization(input, provider), /not suitable/);
  const stage = journeyStageFixture().request;
  stage.profile.eligibility = "pregnant_or_breastfeeding";
  stage.sources["profile.eligibility"] = stage.profile.eligibility;
  await assert.rejects(runModelStage(stage, provider), /not suitable/);
  assert.equal(calls, 0);
});
