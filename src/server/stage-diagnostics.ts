// ABOUTME: Explicit development-only, loopback-only local failure diagnostics, never trace export.
// ABOUTME: Validator messages may include user text, so the ignored file is private and contains no provider payload.
import { appendFileSync, chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { StageTrace } from "../agent/stage-runtime";

export function recordLocalStageIssues(trace: StageTrace, requestUrl: string) {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ADAPTIVE_LOCAL_DIAGNOSTICS !== "true" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(new URL(requestUrl).hostname)
  )
    return;
  const rejected = trace.submissions.filter((s) => s.issues.length);
  if (!rejected.length && trace.status !== "failed") return;
  try {
    const dir = join(process.cwd(), ".runtime");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const path = join(dir, "local-stage-issues.jsonl");
    appendFileSync(
      path,
      JSON.stringify({
        at: new Date().toISOString(),
        runId: trace.runId,
        requestId: trace.requestId,
        operation: trace.toolName,
        status: trace.status,
        rejected: rejected.map((s) => ({ atMs: s.atMs, issues: s.issues })),
        error: trace.error ?? null,
      }) + "\n",
      { mode: 0o600 },
    );
    chmodSync(path, 0o600);
  } catch {
    // Diagnostics cannot replace the business result or expose their contents in logs.
  }
}
