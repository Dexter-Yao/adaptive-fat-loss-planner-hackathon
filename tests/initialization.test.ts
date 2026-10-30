// ABOUTME: Initialization preserves explicit choices and rejects invented facts or unquoted reasoning.
import assert from "node:assert/strict";
import test from "node:test";
import {
  reviewInitialization,
  INITIALIZATION_INSTRUCTIONS,
} from "../src/agent/initialize";
import { InitializationInputSchema } from "../src/domain/initialization";
import type { AgentProvider } from "../src/agent/session";
import { requestAt } from "./support/fixtures";
const input = () => {
  const r = requestAt();
  return { profile: r.profile, goal: r.goal, preferences: r.preferences };
};

test("initialization works without LLM and labels estimates explicitly", async () => {
  const value = input();
  value.profile.bodyFat = null;
  const r = await reviewInitialization(value);
  assert.equal(r.aiStatus, "unavailable");
  assert.equal(r.interpretation, null);
  assert.equal(r.baseline.bodyFatSource, "jackson_reference");
  assert.equal(r.baseline.pal, 1.6);
});

test("a model cannot replace explicit categories, invent PAL, or use an invalid quote; a corrected call can recover", async () => {
  const i = input(),
    provider: AgentProvider = {
      name: "codex",
      model: "synthetic",
      async run(_prompt, context, _tools, handle) {
        const source = JSON.parse(context).evidenceOptions;
        const valid = {
          work: i.profile.activity.work,
          leisure: i.profile.activity.leisure,
          rationale: [
            {
              evidenceId: source.find(
                (s: { sourceId: string }) => s.sourceId === "work",
              ).evidenceId,
              explanation: "Use the explicit current work choice.",
            },
          ],
          questions: [],
        };
        assert.equal(
          (await handle("present_initialization", { ...valid, work: "heavy" }))
            .status,
          "rejected",
        );
        assert.equal(
          (await handle("present_initialization", { ...valid, pal: 2.3 }))
            .status,
          "rejected",
        );
        assert.equal(
          (
            await handle("present_initialization", {
              ...valid,
              rationale: [
                {
                  evidenceId: "nonexistent-source",
                  explanation: "Invented",
                },
              ],
            })
          ).status,
          "rejected",
        );
        assert.equal(
          (await handle("present_initialization", valid)).status,
          "ok",
        );
      },
    };
  const r = await reviewInitialization(i, provider);
  assert.equal(r.aiStatus, "completed");
  assert.equal(r.baseline.pal, 1.6);
  assert.equal(r.interpretation?.clarification, null);
  assert.equal(r.interpretation?.rationale[0].sourceId, "work");
  assert.equal(r.interpretation?.rationale[0].quote, i.profile.activity.work);
});

test("missing physiological facts fail before a provider can invent them", () => {
  const i = input();
  const { ageYears: _, ...missing } = i.profile;
  assert.equal(
    InitializationInputSchema.safeParse({ ...i, profile: missing }).success,
    false,
  );
  assert.match(INITIALIZATION_INSTRUCTIONS, /future capacity|future gym/i);
  assert.match(INITIALIZATION_INSTRUCTIONS, /one clarification/i);
});
