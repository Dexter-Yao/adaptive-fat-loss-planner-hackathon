// ABOUTME: Bounded matched replays of explicitly fictional saved J03 requests through the real stage port.
// ABOUTME: One persistent call/dollar ledger includes repairs/failures; offline Ultra judgments share that ceiling.
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  openSync,
  closeSync,
  unlinkSync,
  renameSync,
} from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import {
  StageRequestSchema,
  StageResponseSchema,
  type StageResponse,
} from "../src/domain/workflow";
import { EvalIdentitySchema } from "../src/evaluation/contracts";
import { reviewSuite } from "../src/evaluation/review-suite";
import {
  InferenceBudget,
  costSummary,
  ModelPriceSchema,
  type BudgetState,
} from "../src/evaluation/inference-budget";
import { nebiusProvider } from "../src/agent/providers/nebius";
import { runObservedStage } from "../src/agent/observed-stage";
import {
  langSmithClient,
  traceSummary,
  type TraceExport,
} from "../src/agent/observability";
import { contentHash, type StageTrace } from "../src/agent/stage-runtime";
import {
  evaluatePlan,
  planEvaluationInput,
  PLAN_JUDGE_MODEL,
} from "../src/evaluation/plan-judge";
import {
  planReviewPacket,
  renderPlanReview,
} from "../src/evaluation/plan-review";

const arg = (key: string, fallback = "") =>
  process.argv.find((s) => s.startsWith(`--${key}=`))?.slice(key.length + 3) ??
  fallback;
const read = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const inputSchema = z.object({
  identity: EvalIdentitySchema,
  provenance: z.object({
    sourceFile: z.string(),
    originalRequestHash: z.string(),
    explicitFictionalSource: z.literal(true),
  }),
  request: StageRequestSchema,
});
async function readback(
  runId: string | null,
  traces: StageTrace[],
  requestId: string,
  candidateRunId?: string,
  proof?: {
    request?: unknown;
    result?: unknown;
    judgment?: unknown;
    inputHash?: string;
    caseData?: unknown;
    dimensionId?: string;
  },
) {
  if (!runId || process.env.LANGSMITH_TRACING !== "true")
    return { verified: false, reason: "tracing_disabled_or_missing_id" };
  const client = langSmithClient(process.env, { timeoutMs: 10_000 });
  const checked = await Promise.allSettled(
    [runId, ...traces.map((t) => t.runId)].map(async (id) => {
      const r = await client.readRun(id);
      const metadata = r.extra?.metadata;
      const child = traces.find((t) => t.runId === id);
      const verified =
        r.id === id &&
        (candidateRunId
          ? metadata?.candidateRunId === candidateRunId &&
            metadata?.inputHash === proof?.inputHash &&
            metadata?.dimensionId === proof?.dimensionId &&
            isDeepStrictEqual(r.inputs?.caseData, proof?.caseData) &&
            isDeepStrictEqual(r.outputs?.judgment, proof?.judgment)
          : metadata?.requestId === requestId &&
            metadata?.content === "fictional" &&
            (id === runId
              ? isDeepStrictEqual(r.inputs?.request, proof?.request) &&
                isDeepStrictEqual(r.outputs?.result, proof?.result)
              : r.parent_run_id === runId &&
                isDeepStrictEqual(r.inputs, child?.request) &&
                isDeepStrictEqual(
                  r.outputs?.responses,
                  child ? traceSummary(child).responses : undefined,
                )));
      return { id, verified };
    }),
  );
  return {
    verified: checked.every(
      (r) => r.status === "fulfilled" && r.value.verified,
    ),
    checked: checked.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : { verified: false, reason: "readback_unavailable" },
    ),
  };
}
async function main() {
  if (process.env.NODE_ENV === "production")
    throw Error("Trusted local fictional evaluation only.");
  const mode = z
    .enum(["inspect", "run", "judge", "readback"])
    .parse(arg("mode", "inspect"));
  if (mode === "readback") {
    const path = arg("receipt"),
      receipt = await read(path);
    if (receipt.dimensions) {
      receipt.readbacks = await Promise.all(
        receipt.dimensions.map(
          async (d: {
            dimensionId: string;
            judgment: unknown;
            traceExport: { runId: string | null };
          }) =>
            readback(d.traceExport.runId, [], "", receipt.candidateRunId, {
              inputHash: receipt.inputHash,
              caseData: receipt.caseData,
              dimensionId: d.dimensionId,
              judgment: d.judgment,
            }),
        ),
      );
    } else {
      inputSchema.parse({
        identity: receipt.identity,
        provenance: receipt.provenance,
        request: receipt.request,
      });
      receipt.readback = await readback(
        receipt.traceExport.runId,
        receipt.traces,
        receipt.request.binding.requestId,
        undefined,
        { request: receipt.request, result: receipt.result },
      );
    }
    await writeFile(path, JSON.stringify(receipt, null, 2), { mode: 0o600 });
    console.log(
      JSON.stringify({
        mode,
        readback: receipt.readback ?? receipt.readbacks,
        inferenceCalls: 0,
      }),
    );
    return;
  }
  const identityId = z
    .string()
    .regex(/^[\w.-]{1,100}$/)
    .parse(arg("experiment"));
  const root = ".runtime/eval-cost";
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const directory = `${root}/${identityId}`;
  mkdirSync(directory, { mode: 0o700 }); // Exclusive experiment identity; never overwrite a failed attempt.
  const save = (name: string, value: unknown) =>
    writeFile(`${directory}/${name}`, JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  const snapshot = await read(`${root}/models-info.json`);
  if (
    snapshot.source !==
      "https://tokenfactory.nebius.com/api/public/models_info" ||
    Date.now() - Date.parse(snapshot.checkedAt) > 86_400_000
  )
    throw Error(
      "Refresh the official price/capability snapshot before inference.",
    );
  const prices = z.array(ModelPriceSchema).parse(
    snapshot.models.flatMap((m: { flavors: Record<string, unknown>[] }) =>
      m.flavors.map((f) => ({
        model: f.model_id,
        inputUsdPerMillion: f.input_price_per_million_tokens,
        outputUsdPerMillion: f.output_price_per_million_tokens,
      })),
    ),
  );
  const input =
    mode === "judge" ? null : inputSchema.parse(await read(arg("input")));
  if (
    input &&
    contentHash(input.request) !== input.provenance.originalRequestHash
  )
    throw Error("The saved request/provenance hash differs.");
  // This runner is intentionally narrower than an arbitrary health-data uploader:
  // only these four exact, already-recorded fictional J03 adaptation requests qualify.
  if (input) {
    const approvedHashes = {
      interpret:
        "8ce45b51d48d64c7842dc86d104bb952a4384ef92cc1bea4ce1fccc352a83a0a",
      generate:
        "1fad5009f5918db29c9c636d6a0ab6f698755bf720032f542e9c4e465cc253d1",
      revise:
        "6a25e7e0ef14dce314f6f3dad3b25a4e2cd55effedbe56c7b0972498be19a731",
      review_progress:
        "33252de0841e89bf9ca2819581995d628b54d320ea3240474a2664552d28307f",
    };
    const core = reviewSuite.cases.find((c) => c.id === "J03")!.initialInput;
    const { startDate: _originalDate, ...originalBody } = core.profile;
    const { startDate, ...replayedBody } = input.request.profile;
    if (
      contentHash(input.request) !== approvedHashes[input.request.stage] ||
      contentHash(originalBody) !== contentHash(replayedBody) ||
      startDate !== "2026-10-30" ||
      input.request.goal.value !== core.goal.value ||
      input.identity.datasetVersion !== "browser-j03-adaptation-2026-10-30" ||
      !input.request.preferences.context.startsWith("虚构资料：")
    )
      throw Error(
        "Only the four exact approved fictional J03 adaptation requests may be exported.",
      );
  }
  const model =
    mode === "judge"
      ? PLAN_JUDGE_MODEL
      : z.string().startsWith("nvidia/").parse(arg("model"));
  if (!prices.some((p) => p.model === model))
    throw Error("Exact model/price absent from today's official catalog.");
  const thinking = z.enum(["on", "off"]).parse(arg("thinking", "off")) === "on";
  const maxTokens = z.coerce
    .number()
    .int()
    .min(512)
    .max(16_384)
    .parse(arg("max-tokens", mode === "judge" ? "8192" : "4096"));
  const paths = [
    "src/agent/journey-content.ts",
    "src/agent/phase-guidance.ts",
    "src/agent/weekly-guidance.ts",
    "src/agent/progress-review.ts",
    "src/agent/initialize.ts",
    "src/agent/providers/nebius.ts",
    "src/agent/stage-runtime.ts",
    "src/evaluation/plan-judge.ts",
    "src/evaluation/inference-budget.ts",
    "scripts/evaluate-model-cost.ts",
  ];
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      paths.map(async (p) => [p, contentHash(await readFile(p, "utf8"))]),
    ),
  );
  const configuration = {
    model,
    thinking: mode === "judge" || thinking,
    maxTokens,
    maxRequestsPerToolStage: 2,
    priceCheckedAt: snapshot.checkedAt,
  };
  const manifest = {
    mode,
    configuration,
    sourceHashes,
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    configurationHash: contentHash({ sourceHashes, configuration }),
    limits: { maxCalls: 48, maxUsd: 1, maxJudgeCalls: 8 },
    scope:
      "Fictional matched replay, not a browser/controller acceptance or human quality label.",
  };
  await save("manifest.json", manifest);
  if (mode === "inspect") {
    const traces: StageTrace[] = [];
    try {
      await runObservedStage(
        input!.request,
        {
          name: "nebius",
          model,
          async run() {
            throw Error("Prepared without inference.");
          },
        },
        { capturePayload: true, onTrace: (t) => traces.push(t) },
        { env: {} },
      );
    } catch {
      /* Captures actual first-stage context/tools without calling a provider. */
    }
    await save("prepared.json", { input, traces });
    console.log(
      JSON.stringify({
        mode,
        directory,
        stage: input!.request.stage,
        inferenceCalls: 0,
        contextHash: traces[0]?.contextHash,
        contextBytes: Buffer.byteLength(JSON.stringify(traces[0]?.request)),
      }),
    );
    return;
  }
  const lock = openSync(`${root}/budget.lock`, "wx", 0o600);
  try {
    let state: BudgetState & { judgeCalls?: number };
    try {
      state = JSON.parse(readFileSync(`${root}/budget.json`, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      state = { maxCalls: 48, maxUsd: 1, calls: [] };
    }
    const budget = new InferenceBudget(prices, state);
    let judgeCalls = state.judgeCalls ?? 0;
    const persist = () => {
      writeFileSync(
        `${root}/budget.next.json`,
        JSON.stringify({ ...budget.state, judgeCalls }, null, 2),
        { mode: 0o600 },
      );
      renameSync(`${root}/budget.next.json`, `${root}/budget.json`);
    };
    const initialCallCount = budget.state.calls.length;
    const provider = nebiusProvider({
      ...configuration,
      maxRequests: 2,
      beforeRequest(request) {
        if (mode === "judge" && judgeCalls >= 8)
          throw Error(
            "Eight actual Ultra judge requests already reserved; stop.",
          );
        const index = budget.reserve(request);
        if (mode === "judge") judgeCalls++;
        persist();
        return (receipt) => {
          try {
            budget.settle(index, receipt);
          } finally {
            persist();
          }
        };
      },
    });
    if (mode === "judge") {
      const receipt = await read(arg("receipt"));
      const assessment = planEvaluationInput(receipt, identityId);
      const report = await evaluatePlan(assessment, provider, {
        timeoutMs: 180_000,
        signal: AbortSignal.timeout(240_000),
      });
      const retained = {
        ...report,
        manifest,
        cost: costSummary(budget.state.calls.slice(initialCallCount)),
        readbacks: await Promise.all(
          report.dimensions.map((d) =>
            readback(d.traceExport.runId, [], "", assessment.candidateRunId, {
              inputHash: assessment.inputHash,
              caseData: assessment.caseData,
              dimensionId: d.dimensionId,
              judgment: d.judgment,
            }),
          ),
        ),
      };
      await save("judgments.json", retained);
      await writeFile(
        `${directory}/review.html`,
        renderPlanReview(planReviewPacket([receipt], [report])),
        { mode: 0o600 },
      );
      console.log(
        JSON.stringify({
          directory,
          status: report.evaluationStatus,
          verdict: report.planVerdict,
          cost: retained.cost,
          dimensions: report.dimensions.map((d) => ({
            id: d.dimensionId,
            status: d.status,
            verdict: d.judgment?.verdict,
            reason: d.judgment?.reason,
            error: d.error,
          })),
          readback: retained.readbacks.every((r) => r.verified),
        }),
      );
      return;
    }
    const traces: StageTrace[] = [];
    let result: StageResponse | null = null,
      error: string | null = null;
    let traceExport: TraceExport = {
      status: "disabled",
      runId: null,
      stages: 0,
      content: "fictional",
    };
    const started = Date.now();
    try {
      result = StageResponseSchema.parse(
        await runObservedStage(
          input!.request,
          provider,
          {
            signal: AbortSignal.timeout(600_000),
            onTrace: (t) => traces.push(t),
          },
          {
            fictionalEval: { ...input!.identity, experimentId: identityId },
            onExport: (e) => {
              traceExport = e;
            },
          },
        ),
      );
      if (
        traces.some((t) =>
          traceSummary(t).responses.some((r) => r.model !== model),
        )
      )
        throw Error(
          "Returned model differs; no recommendation based on substituted inference.",
        );
    } catch (e) {
      error = e instanceof Error ? e.message : "Stage failed.";
      result = null;
    }
    const elapsedMs = Date.now() - started;
    const calls = budget.state.calls.slice(initialCallCount);
    const receipt = {
      ...manifest,
      identity: { ...input!.identity, experimentId: identityId },
      provenance: input!.provenance,
      caseId: input!.identity.caseId,
      datasetVersion: input!.identity.datasetVersion,
      requestedModel: model,
      requestHash: contentHash(input!.request),
      request: input!.request,
      result,
      error,
      elapsedMs,
      traces,
      summaries: traces.map(traceSummary),
      traceExport,
      calls,
      cost: costSummary(calls),
      humanAnnotation: null,
    };
    const retained = {
      ...receipt,
      readback: await readback(
        traceExport.runId,
        traces,
        input!.request.binding.requestId,
        undefined,
        { request: input!.request, result },
      ),
    };
    await save("receipt.json", retained);
    console.log(
      JSON.stringify({
        directory,
        stage: input!.request.stage,
        model,
        error,
        elapsedMs,
        cost: receipt.cost,
        rejectedSubmissions: receipt.summaries.reduce(
          (n, s) => n + s.rejectedSubmissions,
          0,
        ),
        readback: retained.readback.verified,
        issues: traces
          .flatMap((t) => t.submissions.flatMap((s) => s.issues))
          .slice(0, 8),
      }),
    );
    if (error) process.exitCode = 1;
  } finally {
    closeSync(lock);
    unlinkSync(`${root}/budget.lock`);
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Evaluation failed.");
  process.exitCode = 1;
});
