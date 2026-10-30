// ABOUTME: One approved fictional journey through the actual controller, calculator and observed model stages.
// ABOUTME: Explicit phase bounds prevent a Cartesian sweep; simulated business acceptance is never a human quality label.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { reviewSuite } from "../src/evaluation/review-suite";
import { nebiusProvider } from "../src/agent/providers/nebius";
import { stageModelConfiguration } from "../src/agent/model-routing";
import { runObservedStage } from "../src/agent/observed-stage";
import { traceSummary, type TraceExport } from "../src/agent/observability";
import { contentHash, type StageTrace } from "../src/agent/stage-runtime";
import {
  pendingDraft,
  activeAcceptance,
} from "../src/application/journey-commands";
import { loadSession } from "../src/application/persistence";
import { EvalIdentitySchema } from "../src/evaluation/contracts";
import { planEvaluationInput } from "../src/evaluation/plan-judge";
import { FictionalReceiptSchema } from "../src/evaluation/comparison";
import { SessionSchema } from "../src/application/session";
import { StageRequestSchema } from "../src/domain/workflow";
import { journeyHarness } from "../tests/support/journey-fixtures";
import type { StageRequest, StageResponse } from "../src/domain/workflow";
import { DateSchema, dateInZone } from "../src/domain/facts";
import { z } from "zod";
const arg = (k: string, fallback = "") =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ??
  fallback;
async function main() {
  if (process.env.NODE_ENV === "production")
    throw Error("Fictional local evaluation only.");
  const approved = reviewSuite.cases.find((c) => c.id === arg("case"));
  if (!approved) throw Error("Choose one approved case, J01–J06.");
  const c = structuredClone(approved);
  // Explicit textual adaptation of the core case; body facts, dates, capacity and later history stay unchanged.
  const variant = arg("text-variant")
    ? z
        .object({
          caseId: z.literal("J03"),
          id: z.string().regex(/^[a-z0-9-]{1,60}$/),
          context: z.string().trim().min(1).max(1500),
          foodPreferences: z.string().trim().min(1).max(1500),
          feedbackNotes: z.string().trim().min(1).max(1500),
        })
        .strict()
        .parse(JSON.parse(await readFile(arg("text-variant"), "utf8")))
    : null;
  if (variant) {
    if (
      c.id !== variant.caseId ||
      arg("through", "initial") === "checkins" ||
      arg("replay")
    )
      throw Error(
        "A textual J03 adaptation supports initial/revision only; do not mix untranslated history or replay inputs.",
      );
    c.initialInput.preferences.context = variant.context;
    c.initialInput.preferences.foodPreferences = variant.foodPreferences;
    c.initialFeedback.notes = variant.feedbackNotes;
  }
  const through = arg("through", "initial");
  if (!["initial", "revision", "checkins"].includes(through))
    throw Error("Choose initial, revision or checkins.");
  const until = DateSchema.parse(
    arg("until", c.checkIns.at(-1)!.measurement.date),
  );
  if (until > dateInZone(c.initialInput.profile.timezone))
    throw Error("Do not bypass the future-measurement policy.");
  const model = arg("model"),
    thinking = arg("thinking", "off");
  if (!/^nvidia\/[\w./-]+$/.test(model) || !["on", "off"].includes(thinking))
    throw Error(
      "Choose an explicit NVIDIA model and thinking on/off; no default switch or fallback.",
    );
  const stageModels = Object.fromEntries(
    ["interpret", "generate", "revise", "review_progress"].map((stage) => {
      const selected = arg(`${stage}-model`, model);
      if (!/^nvidia\/[\w./-]+$/.test(selected))
        throw Error(
          "Every selected stage model must be an explicit NVIDIA model.",
        );
      return [stage, selected];
    }),
  );
  const identity = EvalIdentitySchema.parse({
    caseId: c.id,
    datasetVersion: variant
      ? `${reviewSuite.version}.${variant.id}`
      : reviewSuite.version,
    experimentId: arg("experiment"),
    split: "exploration",
    dataClass: "fictional",
  });
  const replay = arg("replay")
    ? JSON.parse(await readFile(arg("replay"), "utf8"))
    : null;
  const resumeDir = arg("resume");
  let resume = null;
  let resumedStage: "generate" | "revise" | null = null;
  if (resumeDir) {
    if (c.id !== "J03" || replay || through === "checkins")
      throw Error(
        "Resume only the same fictional J03 initial/revision chain, without check-ins or replay.",
      );
    const priorConfig = JSON.parse(
      await readFile(`${resumeDir}/configuration.json`, "utf8"),
    );
    resume = SessionSchema.parse(
      JSON.parse(await readFile(`${resumeDir}/session.json`, "utf8")),
    );
    const last = JSON.parse(
      await readFile(`${resumeDir}/index.json`, "utf8"),
    ).at(-1);
    if (!last || !/^J03-\d\d-(?:generate|revise)$/.test(last.caseId))
      throw Error(
        "Resume the recorded final failed plan stage, never an initialization clarification.",
      );
    const failed = FictionalReceiptSchema.parse(
      JSON.parse(await readFile(`${resumeDir}/${last.caseId}.json`, "utf8")),
    );
    const request = StageRequestSchema.parse(failed.request);
    if (request.stage !== "generate" && request.stage !== "revise")
      throw Error("Resume a failed plan stage only.");
    resumedStage = request.stage;
    const draft = pendingDraft(resume);
    if (
      failed.error === null ||
      failed.requestHash !== contentHash(request) ||
      failed.datasetVersion !== identity.datasetVersion ||
      priorConfig.caseId !== c.id ||
      contentHash(priorConfig.textVariant ?? null) !== contentHash(variant) ||
      request.binding.sessionId !== resume.id ||
      contentHash({
        profile: resume.profile,
        goal: resume.goal,
        preferences: resume.preferences,
      }) !== contentHash(c.initialInput) ||
      !resume.initializationReview ||
      resume.initializationReview.interpretation?.clarification ||
      activeAcceptance(resume) ||
      (resumedStage === "generate"
        ? Boolean(draft)
        : !draft ||
          through !== "revision" ||
          request.previousDraft?.id !== draft.id ||
          contentHash(request.previousDraft?.content) !==
            contentHash(draft.content) ||
          !resume.journey.feedback.some(
            (f) => contentHash(f) === contentHash(request.feedback),
          ))
    )
      throw Error(
        "Resume requires the exact fictional failed-stage state, original feedback and an already completed, unambiguous interpretation; never fabricate a setup result.",
      );
  }
  if (replay) {
    const checked = planEvaluationInput(replay, identity.experimentId);
    if (
      !checked.identity.caseId.startsWith(c.id + "-") ||
      checked.identity.datasetVersion !== reviewSuite.version
    )
      throw Error(
        "Replay one completed receipt from this approved case/version, with unchanged inputs.",
      );
  }
  const dir = `.runtime/agent-quality/${identity.experimentId}`;
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const paths = [
    "src/agent/journey-content.ts",
    "src/planning/journey-feasibility.ts",
    "src/agent/weekly-guidance.ts",
    "src/agent/copy-policy.ts",
    "src/agent/initialize.ts",
    "src/agent/progress-review.ts",
    "src/agent/strategies.ts",
    "src/agent/phase-guidance.ts",
    "src/agent/prompt-sections.ts",
    "src/agent/response-language.ts",
    "src/evaluation/plan-judge.ts",
    "src/agent/providers/nebius.ts",
    "src/agent/stage-router.ts",
    "src/agent/stage-runtime.ts",
    "src/domain/plan-quality.ts",
    "src/domain/journey.ts",
    "src/evaluation/journey-cases.json",
    "scripts/run-plan-case.ts",
  ];
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      paths.map(async (p) => [p, contentHash(await readFile(p, "utf8"))]),
    ),
  );
  const metadata = {
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    sourceHashes,
    configurationHash: contentHash({
      sourceHashes,
      stageModels,
      model,
      thinking,
      maxTokens: 16384,
      textVariantHash: variant ? contentHash(variant) : null,
    }),
    datasetVersion: identity.datasetVersion,
    textVariant: variant,
    experimentId: identity.experimentId,
    scope:
      "Fictional approved-case application evaluation, not clinical or human quality evidence.",
    modelConfiguration: {
      defaultModel: model,
      stageModels,
      thinking,
      maxTokens: 16384,
    },
    simulatedAcceptance: !replay && through === "checkins",
    replayOfRun: replay?.traceExport.runId ?? null,
    resumedFrom: resumeDir || null,
    resumedStage,
  };
  await writeFile(
    `${dir}/configuration.json`,
    JSON.stringify({ ...metadata, caseId: c.id, through, until }, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  let count = 0;
  const index: unknown[] = [];
  async function stage(
    request: StageRequest,
    signal: AbortSignal,
  ): Promise<StageResponse> {
    count++;
    const caseId = replay
      ? replay.caseId
      : `${c!.id}-${String(count).padStart(2, "0")}-${request.stage}`;
    const key = {
      interpret: "NEBIUS_INTERPRET",
      generate: "NEBIUS_GENERATE",
      revise: "NEBIUS_REVISE",
      review_progress: "NEBIUS_REVIEW_PROGRESS",
    }[request.stage];
    const stageModel = stageModels[request.stage];
    const provider = nebiusProvider(
      stageModelConfiguration(
        {
          ...process.env,
          [`${key}_MODEL`]: stageModel,
          [`${key}_THINKING`]: thinking,
          [`${key}_MAX_TOKENS`]:
            request.stage === "interpret" ? "2048" : "16384",
        },
        request.stage,
      ),
    );
    const traces: StageTrace[] = [];
    let result: StageResponse | null = null,
      error: string | null = null,
      traceExport: TraceExport | null = null;
    const started = Date.now();
    console.log(
      JSON.stringify({
        event: "start",
        caseId,
        model: stageModel,
        stage: request.stage,
      }),
    );
    try {
      result = await runObservedStage(
        request,
        provider,
        { signal, onTrace: (t) => traces.push(t) },
        {
          fictionalEval: { ...identity, caseId },
          onExport: (e) => {
            traceExport = e;
          },
        },
      );
      return result;
    } catch (e) {
      error = e instanceof Error ? e.message : "Stage failed.";
      throw e;
    } finally {
      const receipt = {
        caseId,
        ...metadata,
        requestHash: contentHash(request),
        request,
        result,
        error,
        elapsedMs: Date.now() - started,
        requestedModel: stageModel,
        traceExport,
        traces,
        summaries: traces.map(traceSummary),
        humanAnnotation: null,
      };
      await writeFile(
        `${dir}/${caseId}.json`,
        JSON.stringify(receipt, null, 2),
        { mode: 0o600 },
      );
      const item = {
        caseId,
        error,
        elapsedMs: receipt.elapsedMs,
        traceExport,
        stages: receipt.summaries,
      };
      index.push(item);
      await writeFile(`${dir}/index.json`, JSON.stringify(index, null, 2), {
        mode: 0o600,
      });
      console.log(JSON.stringify(item));
    }
  }
  if (replay) {
    await stage(
      StageRequestSchema.parse(replay.request),
      AbortSignal.timeout(600_000),
    );
    console.log(
      JSON.stringify({
        event: "matched_replay_complete",
        requestHash: replay.requestHash,
        sourceRun: replay.traceExport.runId,
        applicationChain: false,
      }),
    );
    return;
  }
  // All stage calls override the harness's test double; calculation/storage exercise the real owners.
  const h = journeyHarness({ stage });
  h.setToday(c.initialInput.profile.startDate);
  try {
    if (resume) {
      const beforeRevision = pendingDraft(resume)?.feedbackRevision;
      h.replace(resume);
      await h.controller.retry();
      if (
        resumedStage === "revise" &&
        pendingDraft(h.state)?.feedbackRevision !== beforeRevision! + 1
      )
        throw Error(
          "The failed revision remains incomplete; no extra feedback round was submitted.",
        );
    } else await h.controller.start(structuredClone(c.initialInput), true);
    if (!pendingDraft(h.state))
      throw Error(
        "No complete initial plan; no fixture result was substituted.",
      );
    if (through !== "initial" && resumedStage !== "revise") {
      const draft = pendingDraft(h.state)!;
      await h.controller.feedback({
        ...structuredClone(c.initialFeedback),
        draftId: draft.id,
        sourceRevision: h.state.sourceRevision,
      });
      if (
        pendingDraft(h.state)?.feedbackRevision !==
        draft.feedbackRevision + 1
      )
        throw Error(
          "No complete feedback revision; the preceding draft is retained, not a successful replacement.",
        );
    }
    if (through === "checkins") {
      // Explicit scripted fictional consent only; this is not Dexter's pass label or a real person's consent.
      await h.controller.accept();
      if (!activeAcceptance(h.state))
        throw Error(
          "The simulated acceptance did not pass application checks.",
        );
      for (const e of c.checkIns.filter((e) => e.measurement.date <= until)) {
        h.setToday(e.measurement.date);
        await h.controller.updateMeasurement(structuredClone(e.measurement));
        if (e.reviewMode === "manual") await h.controller.reviewProgress(true);
        if (e.feedback)
          await h.controller.proposeRevision(null, structuredClone(e.feedback));
        if (
          e.proposalDecision === "decline_until_reviewed" &&
          pendingDraft(h.state)
        )
          await h.controller.dismissProposal();
        // review_only never auto-accepts a proposed replacement.
      }
    }
    const restored = loadSession(h.storage).session;
    if (
      !restored ||
      restored.id !== h.state.id ||
      restored.sourceRevision !== h.state.sourceRevision
    )
      throw Error("Save/readback did not restore the actual controller state.");
    console.log(
      JSON.stringify({
        event: "case_complete",
        caseId: c.id,
        through,
        stages: count,
        accepted: Boolean(activeAcceptance(restored)),
        modelGeneratedPlan: Boolean(
          pendingDraft(restored) || activeAcceptance(restored),
        ),
      }),
    );
  } finally {
    if (h.access.read())
      await writeFile(`${dir}/session.json`, JSON.stringify(h.state, null, 2), {
        mode: 0o600,
      });
    h.controller.dispose();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Case run failed.");
  process.exitCode = 1;
});
