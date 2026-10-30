// ABOUTME: Local Luna reasoning settings are explicit and stable per provider instance.
import assert from "node:assert/strict";
import test from "node:test";
import { localProviderConfig } from "../src/agent/providers/local-config";
test("local evaluations can select medium or maximum effort without changing process-global environment", () => {
  assert.deepEqual(localProviderConfig({}, {}), {
    model: "gpt-6-luna",
    reasoningEffort: "medium",
  });
  assert.equal(
    localProviderConfig(
      { reasoningEffort: "max" },
      { CODEX_REASONING_EFFORT: "low" },
    ).reasoningEffort,
    "max",
  );
});
test("unsupported reasoning effort is rejected rather than silently downgraded", () => {
  assert.throws(() =>
    localProviderConfig({}, { CODEX_REASONING_EFFORT: "ultra" }),
  );
});
