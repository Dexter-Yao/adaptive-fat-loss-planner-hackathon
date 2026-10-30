// ABOUTME: Bounded, explicit fictional coach evaluation using an actual accepted J03 model receipt and real controller/calculator/storage.
// ABOUTME: Default prepare mode makes no inference call; run mode retains every result/failure/trace/usage without a model judge or invented human labels.
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { SessionSchema } from "../src/application/session";
import {
  activeAcceptance,
  saveMeasurement,
} from "../src/application/journey-commands";
import { loadSession } from "../src/application/persistence";
import { selectCheckInExperience } from "../src/application/journey-experience-view";
import {
  StageRequestSchema,
  StageResponseSchema,
  type StageRequest,
  type StageResponse,
} from "../src/domain/workflow";
import { dateInZone } from "../src/domain/facts";
import { runObservedStage } from "../src/agent/observed-stage";
import { stageModelConfiguration } from "../src/agent/model-routing";
import { nebiusProvider } from "../src/agent/providers/nebius";
import { contentHash, type StageTrace } from "../src/agent/stage-runtime";
import {
  langSmithClient,
  traceSummary,
  type TraceExport,
} from "../src/agent/observability";
import { EvalIdentitySchema } from "../src/evaluation/contracts";
import { reviewSuite } from "../src/evaluation/review-suite";
import {
  checkInScenarios,
  coachScenarioAssertions,
  coachReviewHtml,
  CHECK_IN_EVALUATION_VERSION,
} from "../src/evaluation/check-in-coaching";
import { journeyHarness } from "../tests/support/journey-fixtures";

const arg = (key: string, fallback = "") =>
  process.argv.find((s) => s.startsWith(`--${key}=`))?.slice(key.length + 3) ??
  fallback;

async function main() {
  if (process.env.NODE_ENV === "production")
    throw Error("Local fictional evaluation only.");
  const mode = arg("mode", "prepare");
  assert.ok(["prepare", "run"].includes(mode), "Choose prepare or run.");
  const sourceSessionText = await readFile(arg("session"), "utf8");
  const sourceReceiptText = await readFile(arg("accepted-receipt"), "utf8");
  const original = SessionSchema.parse(JSON.parse(sourceSessionText));
  const recorded = JSON.parse(sourceReceiptText);
  const recordedRequest = StageRequestSchema.parse(recorded.request);
  const recordedResult = StageResponseSchema.parse(recorded.result);
  const c = reviewSuite.cases.find((c) => c.id === "J03")!;
  assert.equal(recorded.datasetVersion, reviewSuite.version);
  assert.ok(recorded.caseId.startsWith("J03-") && recorded.error === null);
  assert.equal(contentHash(recorded.request), recorded.requestHash);
  assert.deepEqual(recordedRequest.profile, c.initialInput.profile);
  assert.deepEqual(original.profile, c.initialInput.profile);
  assert.deepEqual(original.goal, c.initialInput.goal);
  assert.deepEqual(original.preferences, c.initialInput.preferences);
  assert.ok(
    original.logs.every((l) =>
      c.checkIns.some(
        (e) =>
          contentHash(e.measurement) ===
          contentHash({
            date: l.date,
            weightKg: l.weightKg,
            bodyFat: l.bodyFat,
            notes: l.notes,
          }),
      ),
    ),
  );
  const accepted = activeAcceptance(original)!;
  const draft = original.journey.drafts.find((d) => d.id === accepted?.draftId);
  assert.ok(
    draft && ["generate", "revise"].includes(recordedResult.stage),
    "Need a complete accepted plan, not a fixture or judge.",
  );
  assert.deepEqual(draft.content, recordedResult.result);
  assert.equal(recordedRequest.binding.sessionId, original.id);
  assert.ok(
    original.weeklyPlans.every((w) =>
      w.actions.every((a) => a.checks.length === 0),
    ),
    "Do not invent or strip completed actions.",
  );

  const identity = EvalIdentitySchema.parse({
    caseId: "J03-check-in",
    datasetVersion: CHECK_IN_EVALUATION_VERSION,
    experimentId: arg("experiment"),
    split: "exploration",
    dataClass: "fictional",
  });
  const model = arg("model", "nvidia/nemotron-3-super-120b-a12b"),
    thinking = arg("thinking", "on");
  assert.ok(
    /^nvidia\/[\w./-]+$/.test(model) && ["on", "off"].includes(thinking),
  );
  const configuration = stageModelConfiguration(
    {
      ...process.env,
      NEBIUS_REVIEW_PROGRESS_MODEL: model,
      NEBIUS_REVIEW_PROGRESS_THINKING: thinking,
      NEBIUS_REVIEW_PROGRESS_MAX_TOKENS: "8192",
    },
    "review_progress",
  );
  const selected = arg("scenarios")
    ? arg("scenarios").split(",")
    : checkInScenarios().map((s) => s.id);
  assert.ok(
    selected.length >= 1 &&
      selected.length <= 6 &&
      new Set(selected).size === selected.length,
  );
  const scenarios = selected.map((id) => {
    const s = checkInScenarios().find((s) => s.id === id);
    assert.ok(s, `Unknown scenario ${id}`);
    return s;
  });
  const directory = `.runtime/check-in-coaching/${identity.experimentId}`;
  await mkdir(".runtime/check-in-coaching", { recursive: true });
  await mkdir(directory); // A new experiment is explicit; never overwrite a failed/previous inference.
  const sourcePaths = [
    "src/agent/progress-review.ts",
    "src/agent/check-in-copy.ts",
    "src/agent/check-in-comparison.ts",
    "src/agent/copy-policy.ts",
    "src/agent/response-language.ts",
    "src/agent/strategies.ts",
    "src/agent/stage-context.ts",
    "src/agent/check-in-reasoning.ts",
    "src/application/journey-controller.ts",
    "src/application/journey-commands.ts",
    "src/application/journey-selectors.ts",
    "src/application/check-in-freshness.ts",
    "src/application/selectors.ts",
    "src/evaluation/check-in-coaching.ts",
    "scripts/evaluate-check-in-coaching.ts",
    "src/agent/stage-runtime.ts",
    "src/agent/stage-router.ts",
    "src/agent/providers/nebius.ts",
    "src/planning/journey-calculation.ts",
    "src/planning/measurement-review.ts",
    "src/domain/workflow.ts",
    "src/domain/journey.ts",
  ];
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      sourcePaths.map(async (p) => [p, contentHash(await readFile(p, "utf8"))]),
    ),
  );
  const metadata = {
    identity,
    mode,
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    sourceHashes,
    configuration,
    configurationHash: contentHash({ sourceHashes, configuration }),
    sourceAcceptedReceiptHash: contentHash(JSON.parse(sourceReceiptText)),
    sourceSessionHash: contentHash(JSON.parse(sourceSessionText)),
    acceptedDraftId: draft.id,
    acceptedJourneyId: accepted.id,
    originalAcceptance: "recorded_simulated_acceptance",
    humanAnnotation: null,
    scope:
      "Coach-specific, explicitly fictional, reconstructed prefixes of an actual model-generated accepted plan. No full-plan judge or clinical verdict.",
  };
  const save = (name: string, value: unknown) =>
    writeFile(`${directory}/${name}`, JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  await save("configuration.json", metadata);
  await save("source-session.json", original);
  await writeFile(
    `${directory}/source-accepted-receipt.json`,
    sourceReceiptText,
    { mode: 0o600 },
  );
  const receipts = [];
  for (const scenario of scenarios) {
    console.log(
      JSON.stringify({
        event: "scenario_start",
        scenario: scenario.id,
        mode,
        model,
      }),
    );
    const operation: {
      request: StageRequest | null;
      result: StageResponse | null;
    } = { request: null, result: null };
    let error: string | null = null;
    const traces: StageTrace[] = [];
    const exports: TraceExport[] = [];
    const h = journeyHarness({
      stage: async (r, signal) => {
        assert.equal(
          r.stage,
          "review_progress",
          "No generation or complete-plan judgment in a coach evaluation.",
        );
        assert.equal(
          operation.request,
          null,
          "At most one bounded coach stage per scenario; retry under a fresh experiment.",
        );
        operation.request = structuredClone(r);
        if (mode === "prepare") throw Error("Prepared without inference.");
        operation.result = await runObservedStage(
          r,
          nebiusProvider(configuration),
          { signal, onTrace: (t) => traces.push(t) },
          {
            fictionalEval: { ...identity, caseId: `J03-${scenario.id}` },
            onExport: (e) => exports.push(e),
          },
        );
        return operation.result;
      },
    });
    // Restore the recorded plan, reference and targets. Future observations are
    // removed BEFORE replay; no new plan or business acceptance is synthesized.
    const initial = SessionSchema.parse({
      ...structuredClone(original),
      logs: [],
      snapshot: null,
      previousSnapshot: null,
      journey: {
        ...structuredClone(original.journey),
        calculation: null,
        task: null,
        reviews: [],
        assessments: [],
        assessedKeys: [],
        forecastHistory: [],
      },
    });
    h.replace(initial);
    h.setToday(original.profile.startDate);
    await h.controller.recalculate(false);
    const replayUpdates = [];
    for (const measurement of scenario.measurements) {
      assert.ok(measurement.date <= dateInZone(original.profile.timezone));
      h.setToday(measurement.date);
      const beforeForecast = h.state.snapshot?.forecast;
      const saved = saveMeasurement(h.state, measurement, measurement.date);
      h.replace(saved.session);
      // Replay only the supplied prefix. One final coach assessment follows,
      // avoiding model-written earlier history or future-context leakage.
      await h.controller.recalculate(false);
      replayUpdates.push({
        date: measurement.date,
        numericalChanged: saved.numericalChanged,
        inputHashBefore: beforeForecast?.inputHash,
        inputHashAfter: h.state.snapshot?.forecast?.inputHash,
        endpointBefore: beforeForecast?.modelResults[0].current.at(-1),
        endpointAfter:
          h.state.snapshot?.forecast?.modelResults[0].current.at(-1),
      });
    }
    if (scenario.id === "note-only-access") {
      assert.equal(replayUpdates.at(-1)!.numericalChanged, false);
      assert.deepEqual(
        replayUpdates.at(-1)!.endpointBefore,
        replayUpdates.at(-1)!.endpointAfter,
      );
      assert.equal(
        replayUpdates.at(-1)!.inputHashBefore,
        replayUpdates.at(-1)!.inputHashAfter,
      );
    }
    const before = structuredClone(h.state);
    let modeUsed = "eligible_review";
    try {
      await h.controller.reviewProgress(false);
      if (!operation.request) {
        modeUsed = "explicit_manual_review";
        await h.controller.reviewProgress(true);
      }
    } catch (e) {
      if (mode !== "prepare")
        error = e instanceof Error ? e.message : "Coach stage failed.";
    }
    const { request, result } = operation;
    assert.ok(request, "No bound coach request was prepared.");
    assert.deepEqual(h.state.targetRevisions, before.targetRevisions);
    assert.deepEqual(h.state.weeklyPlans, before.weeklyPlans);
    assert.deepEqual(h.state.journey.acceptances, before.journey.acceptances);
    assert.deepEqual(loadSession(h.storage).session, h.state);
    const assertions =
      mode === "prepare"
        ? {
            kind: "not_run",
            checks: {},
            failed: [],
            humanAnnotation: null,
            semanticQualityVerdict: null,
          }
        : coachScenarioAssertions(scenario, request, result);
    const receipt = {
      ...metadata,
      scenario,
      modeUsed,
      requestHash: contentHash(request),
      request,
      result,
      error,
      traces,
      summaries: traces.map(traceSummary),
      traceExports: exports,
      numericalContext: {
        goalOutcomes: h.state.snapshot?.forecast?.goalOutcomes,
        weightResiduals: h.state.snapshot?.forecast?.weightErrors,
        latestNumericalDate:
          h.state.logs
            .filter((l) => l.weightKg !== null || l.bodyFat !== null)
            .at(-1)?.date ?? null,
      },
      replayUpdates,
      preserved: {
        numericalTargets: true,
        acceptedJourney: true,
        weeklyPlans: true,
        verifiedStorageReadback: true,
      },
      freshness: {
        before: selectCheckInExperience(before, request.binding.asOfDate),
        after: selectCheckInExperience(h.state, request.binding.asOfDate),
      },
      assertions,
      readback: [] as unknown[],
    };
    if (mode === "run" && exports.some((e) => e.runId)) {
      langSmithClient(); // Reuse the shared official-endpoint/credential validation.
      const readRun = async (id: string) => {
        const response = await fetch(
          new URL(
            `/runs/${id}`,
            process.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com",
          ),
          {
            headers: {
              "x-api-key": process.env.LANGSMITH_API_KEY!,
              ...(process.env.LANGSMITH_WORKSPACE_ID
                ? { "x-tenant-id": process.env.LANGSMITH_WORKSPACE_ID }
                : {}),
            },
            signal: AbortSignal.timeout(5000),
          },
        );
        if (!response.ok)
          throw Object.assign(Error("Readback unavailable"), {
            status: response.status,
          });
        return response.json();
      };
      for (const e of exports.filter((e) => e.runId)) {
        try {
          const root = await readRun(e.runId!);
          const verified =
            root.id === e.runId &&
            isDeepStrictEqual(root.inputs?.request, request) &&
            isDeepStrictEqual(root.outputs?.result ?? null, result);
          const children = [];
          for (const trace of traces) {
            const child = await readRun(trace.runId);
            children.push({
              runId: child.id,
              parentRunId: child.parent_run_id,
              verified:
                child.parent_run_id === e.runId &&
                isDeepStrictEqual(
                  child.inputs?.context,
                  trace.request?.context,
                ),
            });
          }
          receipt.readback.push({
            runId: e.runId,
            status:
              verified && children.every((c) => c.verified)
                ? "verified"
                : "mismatch",
            children,
          });
        } catch (error) {
          receipt.readback.push({
            runId: e.runId,
            status: "read_unavailable",
            httpStatus: (error as { status?: number }).status ?? null,
          });
        }
      }
    }
    await save(`${scenario.id}.json`, receipt);
    await save(`${scenario.id}.session.json`, h.state);
    receipts.push(receipt);
    await save(
      "index.json",
      receipts.map((r) => ({
        scenario: r.scenario.id,
        error: r.error,
        result: r.result,
        modeUsed: r.modeUsed,
        summaries: r.summaries,
        traceExports: r.traceExports,
        readback: r.readback,
        assertions: r.assertions,
      })),
    );
    await writeFile(`${directory}/review.html`, coachReviewHtml(receipts), {
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        event: "scenario_complete",
        scenario: scenario.id,
        recommendation:
          result?.stage === "review_progress"
            ? result.result.recommendation
            : null,
        error,
        failedAssertions: assertions.failed,
        summaries: receipt.summaries,
        readback: receipt.readback,
      }),
    );
    if (mode === "run" && (error || assertions.failed.length))
      process.exitCode = 1;
  }
  console.log(
    JSON.stringify({
      event: "complete",
      directory,
      mode,
      humanAnnotation: null,
    }),
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Check-in evaluation failed.");
  process.exitCode = 1;
});
