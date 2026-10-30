// ABOUTME: Bounded offline Ultra evaluations of actual fictional initial/revised plan receipts.
// ABOUTME: Separate model verdicts, execution/trace failures and human calibration; never writes application state.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  nebiusProvider,
  tokenFactoryBaseUrl,
} from "../src/agent/providers/nebius";
import { langSmithClient, traceSummary } from "../src/agent/observability";
import { contentHash } from "../src/agent/stage-runtime";
import { PLAN_QUALITY_VERSION } from "../src/domain/plan-quality";
import {
  evaluatePlan,
  planEvaluationInput,
  PLAN_JUDGE_MODEL,
  PLAN_JUDGE_VERSION,
} from "../src/evaluation/plan-judge";
import {
  planReviewPacket,
  renderPlanReview,
} from "../src/evaluation/plan-review";
const arg = (k: string, fallback = "") =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ??
  fallback;
async function main() {
  if (process.env.NODE_ENV === "production")
    throw Error("Use explicitly fictional local data only.");
  const paths = arg("receipts").split(",").filter(Boolean);
  if (!paths.length || paths.length > 4)
    throw Error("Select 1–4 explicit completed fictional plan receipts.");
  const experimentId = arg("experiment");
  if (!/^[\w.-]{1,100}$/.test(experimentId))
    throw Error("Supply a fresh --experiment identifier.");
  const receipts = await Promise.all(
    paths.map(async (p) => JSON.parse(await readFile(p, "utf8"))),
  );
  const inputs = receipts.map((r) => planEvaluationInput(r, experimentId));
  if (new Set(inputs.map((i) => i.candidateRunId)).size !== inputs.length)
    throw Error("Do not judge one run twice in the same experiment.");
  const dir = join(".runtime/agent-quality", experimentId);
  await mkdir(dir, { recursive: true });
  const config = { model: PLAN_JUDGE_MODEL, maxTokens: 8192, thinking: true };
  const sources = [
    "src/domain/plan-quality.ts",
    "src/evaluation/plan-judge.ts",
    "src/planning/journey-feasibility.ts",
    "src/agent/providers/nebius.ts",
    "src/agent/stage-runtime.ts",
    "src/agent/observability.ts",
    "scripts/evaluate-plans.ts",
  ];
  const manifest = {
    experimentId,
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    createdAt: new Date().toISOString(),
    rubricVersion: PLAN_QUALITY_VERSION,
    judgeVersion: PLAN_JUDGE_VERSION,
    config,
    sourceHashes: Object.fromEntries(
      await Promise.all(
        sources.map(async (p) => [p, contentHash(await readFile(p, "utf8"))]),
      ),
    ),
    candidates: inputs.map(
      ({ identity, candidateRunId, candidateStage, inputHash }) => ({
        identity,
        candidateRunId,
        candidateStage,
        inputHash,
      }),
    ),
    mode: arg("mode", "inspect"),
    calibrated: false,
  };
  // Exclusive creation prevents accidental repeated billing under an existing experiment.
  await writeFile(
    join(dir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  if (manifest.mode === "inspect") {
    console.log(
      JSON.stringify({
        dir,
        plans: inputs.length,
        judgeCalls: 0,
        status: "ready_for_explicit_judge_mode",
      }),
    );
    return;
  }
  if (manifest.mode !== "judge")
    throw Error("Only inspect or judge modes are supported.");
  const base = tokenFactoryBaseUrl(
    process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1",
  );
  const catalogResponse = await fetch(
    base.toString().replace(/\/$/, "") + "/models",
    {
      headers: { Authorization: `Bearer ${process.env.NEBIUS_API_KEY}` },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!catalogResponse.ok)
    throw Error(
      `Catalog HTTP ${catalogResponse.status}; no inference attempted.`,
    );
  const catalog = await catalogResponse.json();
  if (!catalog.data?.some((m: { id: string }) => m.id === PLAN_JUDGE_MODEL))
    throw Error(
      "Requested Ultra is absent from the current catalog; no substitute or inference.",
    );
  await writeFile(
    join(dir, "catalog.json"),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        model: PLAN_JUDGE_MODEL,
        status: catalogResponse.status,
      },
      null,
      2,
    ),
  );
  const reports = [];
  for (const input of inputs) {
    console.log(
      JSON.stringify({
        event: "judge_start",
        caseId: input.identity.caseId,
        candidateRunId: input.candidateRunId,
        dimensions: 4,
        model: PLAN_JUDGE_MODEL,
      }),
    );
    const report = await evaluatePlan(input, nebiusProvider(config));
    const verifiedTraces: {
      runId: string;
      verified: boolean;
      reason?: string;
    }[] = [];
    if (process.env.LANGSMITH_TRACING === "true") {
      const client = langSmithClient(process.env, { timeoutMs: 10_000 });
      for (const d of report.dimensions) {
        if (!d.traceExport.runId || d.traceExport.status === "disabled")
          continue;
        try {
          const run = await client.readRun(d.traceExport.runId);
          verifiedTraces.push({
            runId: d.traceExport.runId,
            verified:
              run.id === d.traceExport.runId &&
              run.extra?.metadata?.candidateRunId === input.candidateRunId,
          });
        } catch {
          verifiedTraces.push({
            runId: d.traceExport.runId,
            verified: false,
            reason: "readback_unavailable",
          });
        }
      }
    }
    const retained = { ...report, verifiedTraces };
    await writeFile(
      join(dir, input.identity.caseId + ".judgments.json"),
      JSON.stringify(retained, null, 2),
      { mode: 0o600 },
    );
    reports.push(retained);
    console.log(
      JSON.stringify({
        event: "judge_finished",
        caseId: input.identity.caseId,
        evaluationStatus: report.evaluationStatus,
        planVerdict: report.planVerdict,
        elapsedMs: report.elapsedMs,
        dimensions: report.dimensions.map((d) => ({
          id: d.dimensionId,
          status: d.status,
          verdict: d.judgment?.verdict ?? null,
          runId: d.traceExport.runId,
          operation: d.trace ? traceSummary(d.trace) : null,
        })),
      }),
    );
  }
  const packet = planReviewPacket(receipts, reports);
  await writeFile(join(dir, "review.html"), renderPlanReview(packet), {
    mode: 0o600,
  });
  await writeFile(join(dir, "review.json"), JSON.stringify(packet, null, 2), {
    mode: 0o600,
  });
  const assessments = reports.flatMap((r) =>
    r.dimensions.flatMap((d) =>
      d.judgment && d.traceExport.runId
        ? [
            {
              rubricVersion: r.rubricVersion,
              criterionId: d.dimensionId,
              caseId: r.identity.caseId,
              candidateRunId: r.candidateRunId,
              judgeRunId: d.traceExport.runId,
              judgeConfigurationId: r.judgeConfigurationHash,
              verdict: d.judgment.verdict,
              critique: d.judgment.reason,
            },
          ]
        : [],
    ),
  );
  await writeFile(
    join(dir, "judge-assessments.json"),
    JSON.stringify(assessments, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      dir,
      plans: reports.length,
      completedJudgments: assessments.length,
      calibrated: false,
    }),
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Plan evaluation failed.");
  process.exitCode = 1;
});
