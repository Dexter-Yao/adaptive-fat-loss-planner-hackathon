// ABOUTME: Local diagnostics must never activate on production/remote requests or copy provider payloads.
// ABOUTME: Synthetic trace and temporary storage only; no model or tracing service is called.
import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  existsSync,
  readFileSync,
  statSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordLocalStageIssues } from "../src/server/stage-diagnostics";
import type { StageTrace } from "../src/agent/stage-runtime";

test("diagnostics require explicit local development and omit raw model payload", () => {
  const cwd = process.cwd(),
    dir = mkdtempSync(join(tmpdir(), "adaptive-diagnostics-"));
  const env = {
    NODE_ENV: process.env.NODE_ENV,
    ADAPTIVE_LOCAL_DIAGNOSTICS: process.env.ADAPTIVE_LOCAL_DIAGNOSTICS,
  };
  const trace: StageTrace = {
    runId: "synthetic",
    requestId: null,
    stage: "journey_generation",
    toolName: "present_strategy",
    promptVersion: "unit",
    provider: "nebius",
    model: "synthetic",
    startedAt: new Date().toISOString(),
    elapsedMs: 1,
    contextHash: "unit",
    instructionsHash: "unit",
    schemaHash: "unit",
    status: "failed",
    error: "Rejected test submission.",
    submissions: [
      {
        atMs: 1,
        issues: ["A required field is missing."],
        args: { secret: "payload-must-not-be-written" },
      },
    ],
  };
  try {
    process.chdir(dir);
    Object.assign(process.env, {
      NODE_ENV: "production",
      ADAPTIVE_LOCAL_DIAGNOSTICS: "true",
    });
    recordLocalStageIssues(trace, "http://localhost/api/journey");
    assert.equal(existsSync(".runtime"), false);
    Object.assign(process.env, {
      NODE_ENV: "development",
      ADAPTIVE_LOCAL_DIAGNOSTICS: "false",
    });
    recordLocalStageIssues(trace, "http://localhost/api/journey");
    assert.equal(existsSync(".runtime"), false);
    process.env.ADAPTIVE_LOCAL_DIAGNOSTICS = "true";
    recordLocalStageIssues(trace, "https://public.example/api/journey");
    assert.equal(existsSync(".runtime"), false);
    recordLocalStageIssues(trace, "http://localhost/api/journey");
    const saved = readFileSync(".runtime/local-stage-issues.jsonl", "utf8");
    assert.ok(saved.includes("A required field is missing."));
    assert.ok(!saved.includes("payload-must-not-be-written"));
    assert.equal(
      statSync(".runtime/local-stage-issues.jsonl").mode & 0o777,
      0o600,
    );
  } finally {
    process.chdir(cwd);
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
