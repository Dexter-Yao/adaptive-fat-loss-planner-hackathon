// ABOUTME: A's real controller/persistence/calculator plus B's actual model stages, driven by fictional user actions.
// ABOUTME: Storage is isolated memory; no browser session, external message or accepted personal target is touched.
import assert from "node:assert/strict";
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { codexProvider } from "../src/agent/providers/codex";
import { nebiusProvider } from "../src/agent/providers/nebius";
import { runModelStage } from "../src/agent/stage-router";
import { journeyHarness } from "../tests/support/journey-fixtures";
import {
  journeyStageFixture,
  STAGE_FIXTURE_DATE,
} from "../tests/support/journey-agent";
import {
  pendingDraft,
  receiveDraft,
  receiveInterpretation,
  newBinding,
} from "../src/application/journey-commands";
import { loadSession } from "../src/application/persistence";
import { addDays } from "../src/domain/facts";
import { SessionSchema, type Session } from "../src/application/session";
import type { StageRequest } from "../src/domain/workflow";
import {
  StageResponseSchema,
  CalculationResponseSchema,
} from "../src/domain/workflow";
import type { StageTrace } from "../src/agent/stage-runtime";

async function main() {
  const arg = (key: string, fallback: string) =>
    process.argv
      .find((a) => a.startsWith(`--${key}=`))
      ?.slice(key.length + 3) ?? fallback;
  const providerName = arg("provider", "codex"),
    effort = arg("effort", "medium") as "medium" | "max";
  if (
    !["codex", "nebius"].includes(providerName) ||
    !["medium", "max"].includes(effort)
  )
    throw new Error("Choose codex/nebius and medium/max explicitly.");
  const provider =
    providerName === "nebius"
      ? nebiusProvider()
      : codexProvider({ model: "gpt-6-luna", reasoningEffort: effort });
  const httpBase = arg("http", "");
  if (httpBase) {
    const u = new URL(httpBase);
    if (
      u.protocol !== "http:" ||
      !["127.0.0.1", "localhost"].includes(u.hostname) ||
      u.port === "3210" ||
      u.pathname !== "/" ||
      u.search ||
      u.hash ||
      u.username ||
      u.password
    )
      throw new Error(
        "Use a dedicated local test origin, never the user's 3210 session.",
      );
    const status = await (await fetch(new URL("api/status", u))).json();
    if (
      !status.ready ||
      status.provider !== provider.name ||
      status.model !== provider.model
    )
      throw new Error(
        "The test server's actual provider/model does not match this run.",
      );
  }
  const requested = arg("cases", "main,progress").split(",");
  if (
    requested.some(
      (c) =>
        ![
          "main",
          "progress",
          "allergy",
          "long",
          "clarification",
          "infeasible",
          "smoke",
          "feedback",
        ].includes(c),
    )
  )
    throw new Error("Unknown workflow case.");
  const dir = `.runtime/llm-stages-2026-10-28/workflow-${provider.name}-${effort}-${Date.now()}`;
  await mkdir(dir, { recursive: true });
  const hashes: Record<string, string> = {};
  async function hashTree(path: string) {
    for (const e of await readdir(path, { withFileTypes: true })) {
      const p = join(path, e.name);
      if (e.isDirectory()) await hashTree(p);
      else if (/\.(?:ts|tsx|json)$/.test(e.name))
        hashes[p] = createHash("sha256")
          .update(await readFile(p))
          .digest("hex");
    }
  }
  await hashTree("src");
  await hashTree("tests/support");
  const acceptedPath = arg("accepted", "");
  const acceptedJson = acceptedPath
    ? await readFile(acceptedPath, "utf8")
    : null;
  const resumePath = arg("resume", "");
  const resumeJson = resumePath ? await readFile(resumePath, "utf8") : null;
  if (acceptedPath && resumePath)
    throw new Error(
      "Resume an unfinished main flow or an accepted progress branch, not both.",
    );
  const metadata = {
    startedAt: new Date().toISOString(),
    provider: provider.name,
    model: provider.model,
    effort: provider.name === "codex" ? effort : null,
    httpBase: httpBase || null,
    baseCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    sourceHashes: hashes,
    acceptedReceipt: acceptedPath || null,
    acceptedReceiptHash: acceptedJson
      ? createHash("sha256").update(acceptedJson).digest("hex")
      : null,
    resumeReceipt: resumePath || null,
    resumeReceiptHash: resumeJson
      ? createHash("sha256").update(resumeJson).digest("hex")
      : null,
    scope:
      "Fictional persisted workflow and model behavior; browser UX, human usefulness and prospective accuracy are separate.",
  };
  await writeFile(`${dir}/metadata.json`, JSON.stringify(metadata, null, 2));
  let accepted: Session | null = acceptedJson
    ? SessionSchema.parse(JSON.parse(acceptedJson).state)
    : null;
  if (accepted && (!accepted.isExample || !accepted.journey.acceptances.length))
    throw new Error(
      "Resume only an explicitly fictional accepted workflow receipt.",
    );
  function harness(label: string) {
    const traces: StageTrace[] = [],
      requests: StageRequest[] = [],
      results: unknown[] = [],
      httpCalls: unknown[] = [];
    async function post(
      path: string,
      r: { binding: unknown },
      signal: AbortSignal,
    ) {
      const started = Date.now();
      const response = await fetch(new URL(path, httpBase), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: new URL(httpBase).origin,
        },
        body: JSON.stringify(r),
        signal,
      });
      const body = await response.json();
      httpCalls.push({
        path,
        binding: r.binding,
        status: response.status,
        elapsedMs: Date.now() - started,
      });
      if (!response.ok) throw new Error(body.error ?? "HTTP stage failed.");
      return body;
    }
    const h = journeyHarness({
      ...(httpBase
        ? {
            calculate: async (r, signal) =>
              CalculationResponseSchema.parse(
                await post("/api/forecast", r, signal),
              ),
          }
        : {}),
      stage: async (r, signal) => {
        requests.push(structuredClone(r));
        const response = httpBase
          ? StageResponseSchema.parse(await post("/api/journey", r, signal))
          : await runModelStage(r, provider, {
              signal,
              capturePayload: true,
              onTrace: (t) => {
                traces.push(t);
                writeFileSync(
                  `${dir}/${label}-trace-${traces.length}.json`,
                  JSON.stringify(t, null, 2),
                );
                console.log(
                  JSON.stringify({
                    case: label,
                    stage: t.stage,
                    status: t.status,
                    elapsedMs: t.elapsedMs,
                    requestId: t.requestId,
                  }),
                );
              },
            });
        results.push(response);
        return response;
      },
    });
    h.setToday(STAGE_FIXTURE_DATE);
    const save = async (status: string, error?: unknown) => {
      const payload = {
        ...metadata,
        label,
        status,
        error: error instanceof Error ? error.message : (error ?? null),
        requests,
        traces,
        results,
        httpCalls,
        state: h.access.read(),
        humanReview: "not_reviewed",
      };
      await writeFile(`${dir}/${label}.json`, JSON.stringify(payload, null, 2));
      console.log(
        JSON.stringify({
          case: label,
          status,
          modelCalls: httpBase ? null : traces.length,
          modelStageRequests: requests.length,
          httpCalls: httpCalls.length,
          elapsedMs: httpBase
            ? null
            : traces.reduce((n, t) => n + t.elapsedMs, 0),
          error: payload.error,
          receipt: `${dir}/${label}.json`,
        }),
      );
    };
    return { h, save, requests, traces };
  }
  if (provider.name === "nebius" && !process.env.NEBIUS_API_KEY)
    throw new Error(
      "Nebius API key is unavailable in this process; configure its server-side location before this real-inference run.",
    );
  if (
    (requested.includes("main") || requested.includes("progress")) &&
    !accepted
  ) {
    const { h, save } = harness("main");
    try {
      if (resumeJson) {
        const state = SessionSchema.parse(JSON.parse(resumeJson).state);
        if (!state.isExample)
          throw new Error("Resume only fictional eval state.");
        h.replace(state);
        await h.controller.retry();
      } else await h.controller.start(journeyStageFixture().input, true);
      assert.ok(pendingDraft(h.state));
      assert.equal(h.state.targetRevisions.length, 0);
      for (
        let revision = pendingDraft(h.state)!.feedbackRevision + 1;
        revision <= 3;
        revision++
      ) {
        const d = pendingDraft(h.state)!;
        await h.controller.feedback({
          draftId: d.id,
          sourceRevision: d.binding.sourceRevision,
          priorities: ["less_time"],
          availableTrainingMinutes: revision === 1 ? 30 : 0,
          requestedGoalDate: null,
          notes:
            revision === 1
              ? "Only one short walk fits; keep bought lunches simple."
              : revision === 2
                ? "No planned training time is available. Keep easy bought-food options."
                : "Keep training at zero; give a second convenient bought-lunch option.",
        });
        assert.equal(pendingDraft(h.state)?.feedbackRevision, revision);
      }
      const third = structuredClone(h.state),
        d = pendingDraft(h.state)!;
      await h.controller.feedback({
        draftId: d.id,
        sourceRevision: d.binding.sourceRevision,
        priorities: ["other"],
        availableTrainingMinutes: null,
        requestedGoalDate: null,
        notes: "This third revision still does not suit me.",
      });
      assert.equal(h.state.journey.acceptances.length, 0);
      await assert.rejects(h.controller.retry(), /three feedback/);
      // A separate synthetic branch tests accepting, without undoing the rejected user's feedback.
      const acceptedHarness = harness("accepted-third");
      acceptedHarness.h.replace(third);
      await acceptedHarness.h.controller.accept();
      accepted = structuredClone(acceptedHarness.h.state);
      assert.equal(accepted.journey.acceptances.length, 1);
      assert.deepEqual(
        loadSession(acceptedHarness.h.storage).session,
        accepted,
      );
      await acceptedHarness.save("completed");
      await save("completed");
    } catch (error) {
      await save("failed", error);
      process.exitCode = 1;
    }
  }
  if (requested.includes("progress") && accepted) {
    const baseline = accepted,
      reference = baseline.journey.acceptances[0].reference;
    for (const name of [
      "quiet",
      "single-noisy",
      "body-fat-device",
      "scope-note",
      "sustained",
    ]) {
      const { h, save } = harness(name);
      h.replace(structuredClone(baseline));
      try {
        const day = addDays(baseline.profile.startDate, 7);
        h.setToday(day);
        const expected = reference.modelResults[0].current.find(
          (p) => p.date === day,
        )!;
        if (name === "quiet") {
          await h.controller.updateMeasurement({
            date: day,
            weightKg: expected.weightKg,
            bodyFat: null,
            notes: "Measured at the usual time. The routine feels manageable.",
          });
          assert.equal(
            h.state.journey.reviews.length,
            0,
            "An unchanged continuation must not automatically call the coach.",
          );
          await h.controller.reviewProgress(true);
          assert.ok(
            ["keep_plan", "remeasure"].includes(
              h.state.journey.reviews.at(-1)!.result.recommendation,
            ),
          );
        } else if (name === "single-noisy") {
          await h.controller.updateMeasurement({
            date: day,
            weightKg: expected.weightKg + 1.4,
            bodyFat: null,
            notes:
              "After travel, I weighed after dinner instead of at my usual morning time.",
          });
        } else if (name === "body-fat-device") {
          await h.controller.updateMeasurement({
            date: day,
            weightKg: null,
            bodyFat: { percent: expected.bodyFatPct! + 3, method: "bia" },
            notes:
              "This is a different body-fat device, not the original measurement method.",
          });
        } else if (name === "scope-note") {
          await h.controller.updateMeasurement({
            date: day,
            weightKg: null,
            bodyFat: null,
            notes: "I have chest pain and severe dizziness.",
          });
          assert.ok(
            ["pause", "remeasure"].includes(
              h.state.journey.reviews.at(-1)!.result.recommendation,
            ),
          );
        } else {
          for (const n of [7, 14, 20]) {
            const date = addDays(baseline.profile.startDate, n);
            h.setToday(date);
            const p = reference.modelResults[0].current.find(
              (p) => p.date === date,
            )!;
            await h.controller.updateMeasurement({
              date,
              weightKg: p.weightKg + 1.8,
              bodyFat: null,
              notes:
                "My usual lunch shop is closed and bought-lunch choices have become harder. I do not have intake records.",
            });
          }
        }
        assert.deepEqual(
          h.state.targetRevisions,
          baseline.targetRevisions,
          "Advice cannot apply an unaccepted numerical change.",
        );
        assert.deepEqual(loadSession(h.storage).session, h.state);
        await save("completed");
      } catch (error) {
        await save("failed", error);
        process.exitCode = 1;
      }
    }
  }
  if (requested.includes("feedback")) {
    const { h, save } = harness("feedback");
    try {
      const path = arg("proposal", "");
      if (!path)
        throw new Error(
          "Provide a prior fictional smoke receipt with --proposal.",
        );
      const raw = await readFile(path, "utf8"),
        seed = JSON.parse(raw);
      if (!seed.state?.isExample)
        throw new Error("Use only a fictional provider-generated proposal.");
      const responses = seed.results.map((r: unknown) =>
        StageResponseSchema.parse(r),
      );
      const interpretation = responses.find(
          (r: { stage: string }) => r.stage === "interpret",
        ),
        proposal = responses.find(
          (r: { stage: string }) => r.stage === "generate",
        );
      if (!interpretation || !proposal)
        throw new Error(
          "The seed needs an actual interpretation and generated proposal.",
        );
      let state = receiveInterpretation(
        journeyStageFixture().session,
        interpretation.result,
      );
      state = receiveDraft(
        state,
        proposal.result,
        newBinding(state, STAGE_FIXTURE_DATE),
      );
      h.replace(state);
      const d = pendingDraft(h.state)!;
      await h.controller.feedback({
        draftId: d.id,
        sourceRevision: d.binding.sourceRevision,
        priorities: ["less_time"],
        availableTrainingMinutes: 0,
        requestedGoalDate: null,
        notes:
          "Work travel leaves no planned training time. Keep bought lunches ready to eat.",
      });
      assert.equal(pendingDraft(h.state)?.feedbackRevision, 1);
      assert.equal(h.state.targetRevisions.length, 0);
      assert.deepEqual(loadSession(h.storage).session, h.state);
      await writeFile(
        `${dir}/feedback-seed.json`,
        JSON.stringify(
          { path, hash: createHash("sha256").update(raw).digest("hex") },
          null,
          2,
        ),
      );
      await save("completed");
    } catch (error) {
      await save("failed", error);
      process.exitCode = 1;
    }
  }
  if (requested.includes("smoke")) {
    const { h, save } = harness("smoke");
    try {
      await h.controller.start(journeyStageFixture().input, true);
      assert.ok(pendingDraft(h.state));
      await h.controller.accept();
      const targets = structuredClone(h.state.targetRevisions),
        day = addDays(STAGE_FIXTURE_DATE, 7);
      const point =
        h.state.journey.acceptances[0].reference.modelResults[0].current.find(
          (p) => p.date === day,
        )!;
      h.setToday(day);
      await h.controller.updateMeasurement({
        date: day,
        weightKg: point.weightKg + 1.4,
        bodyFat: null,
        notes:
          "After travel, I weighed after dinner instead of at my usual morning time.",
      });
      if (!h.state.journey.reviews.length)
        await h.controller.reviewProgress(true);
      assert.equal(h.state.journey.acceptances.length, 1);
      assert.ok(h.state.journey.reviews.length);
      assert.deepEqual(h.state.targetRevisions, targets);
      assert.deepEqual(loadSession(h.storage).session, h.state);
      await save("completed");
    } catch (error) {
      await save("failed", error);
      process.exitCode = 1;
    }
  }
  for (const name of requested.filter((c) =>
    ["allergy", "long", "clarification", "infeasible"].includes(c),
  )) {
    const { h, save } = harness(name);
    try {
      const input = journeyStageFixture(
        name === "long" ? 55 : name === "infeasible" ? 7 : 21,
        name === "allergy"
          ? "I have a peanut allergy. I am not allergic to eggs; I like eggs. No seafood. A microwave is available."
          : undefined,
      ).input;
      if (name === "clarification") {
        input.profile.activity.leisure = "very_light";
        input.preferences.context =
          "I run almost every day. I work at a desk, buy lunches and have no kitchen.";
      }
      if (name === "infeasible") input.goal.value = 72;
      if (name === "clarification") {
        await h.controller.start(input, true);
        assert.ok(h.state.initializationReview?.interpretation?.clarification);
        assert.equal(pendingDraft(h.state), null);
        assert.equal(h.state.targetRevisions.length, 0);
      } else {
        await h.controller.start(input, true);
        assert.ok(pendingDraft(h.state));
      }
      await save("completed");
    } catch (error) {
      await save("failed", error);
      process.exitCode = 1;
    }
  }
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Workflow eval failed.",
  );
  process.exitCode = 1;
});
