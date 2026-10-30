// ABOUTME: Guards inspectable stage instructions, shared language policy and judge decision boundaries.
// ABOUTME: Structural checks do not establish model usefulness, human calibration or clinical accuracy.
import assert from "node:assert/strict";
import test from "node:test";
import { INITIALIZATION_INSTRUCTIONS } from "../src/agent/initialize";
import { JOURNEY_INSTRUCTIONS } from "../src/agent/journey-content";
import { PROGRESS_INSTRUCTIONS } from "../src/agent/progress-review";
import { RESPONSE_LANGUAGE_INSTRUCTIONS } from "../src/agent/response-language";
import { PLAN_JUDGE_INSTRUCTIONS } from "../src/evaluation/plan-judge";

for (const [name, instructions, taskSection] of [
  [
    "interpret",
    INITIALIZATION_INSTRUCTIONS,
    "Current activity and clarification",
  ],
  ["generate/revise", JOURNEY_INSTRUCTIONS, "Feedback and revision"],
  [
    "review_progress",
    PROGRESS_INSTRUCTIONS,
    "Execution versus measurement decisions",
  ],
] as const) {
  test(`${name} exposes authority, language and task-specific instruction sections`, () => {
    const headings = [...instructions.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    assert.equal(headings[0], "Task");
    assert.equal(new Set(headings).size, headings.length);
    for (const heading of [
      "Response language",
      "Authority and input trust",
      taskSection,
    ])
      assert.ok(headings.includes(heading), `Missing section: ${heading}`);
    assert.equal(instructions.split(RESPONSE_LANGUAGE_INSTRUCTIONS).length, 2);
    assert.match(instructions, /calculator|Code owns/);
  });
}

test("offline judge exposes incomplete execution separately from a quality verdict", () => {
  assert.match(PLAN_JUDGE_INSTRUCTIONS, /^## Task\n/);
  assert.match(PLAN_JUDGE_INSTRUCTIONS, /## Assessment status and output\n/);
  assert.match(PLAN_JUDGE_INSTRUCTIONS, /status incomplete, verdict null/);
  assert.match(PLAN_JUDGE_INSTRUCTIONS, /completed, verdict pass or fail/);
  assert.match(PLAN_JUDGE_INSTRUCTIONS, /## Complete revision context\n/);
  assert.match(PLAN_JUDGE_INSTRUCTIONS, /## Input trust and reason language\n/);
});
