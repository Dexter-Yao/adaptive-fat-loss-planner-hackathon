// ABOUTME: Frozen fictional few-shot checks against the actual configured local Luna provider.
// ABOUTME: Stores real prompts/tool receipts; never uploads a user's body measurements.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { makeExample } from "../src/domain/example";
import { reviewInitialization } from "../src/agent/initialize";
import { codexProvider } from "../src/agent/providers/codex";
import type { AgentProvider } from "../src/agent/session";
const dir = `.runtime/three-model-2026-10-28/initialization-${Date.now()}`;
async function main() {
  const files = [
    "src/agent/initialize.ts",
    "src/domain/initialization.ts",
    "src/domain/facts.ts",
    "src/planning/activity.ts",
    "src/planning/inputs.ts",
    "src/agent/providers/codex.ts",
  ];
  const hashes = Object.fromEntries(
    await Promise.all(
      files.map(async (f) => [
        f,
        createHash("sha256")
          .update(await readFile(f))
          .digest("hex"),
      ]),
    ),
  );
  const base = makeExample("2026-10-28");
  const { profile, goal, preferences } = base;
  const cases = [
    {
      id: "future-wishes-are-not-current",
      input: {
        profile: {
          ...profile,
          activity: {
            ...profile.activity,
            work: "very_light" as const,
            leisure: "very_light" as const,
            routines: [],
          },
        },
        goal,
        preferences: {
          ...preferences,
          context:
            "Fictional case. I sit at a desk and currently do no exercise. I hope to train four times a week in the future.",
        },
      },
      clarify: false,
    },
    {
      id: "seated-regular-training",
      input: {
        profile: {
          ...profile,
          activity: {
            ...profile.activity,
            work: "very_light" as const,
            leisure: "active" as const,
            routines: [
              { kind: "running" as const, minutes: 30, timesPerWeek: 3 },
            ],
          },
        },
        goal,
        preferences: {
          ...preferences,
          context:
            "Fictional case. Seated work and three current runs each week.",
        },
      },
      clarify: false,
    },
    {
      id: "physical-work-without-training",
      input: {
        profile: {
          ...profile,
          activity: {
            ...profile.activity,
            work: "moderate" as const,
            leisure: "very_light" as const,
            routines: [],
          },
        },
        goal,
        preferences: {
          ...preferences,
          context:
            "Fictional case. Active kitchen work on my feet but no leisure exercise.",
        },
      },
      clarify: false,
    },
    {
      id: "one-important-ambiguity",
      input: {
        profile: {
          ...profile,
          activity: {
            ...profile.activity,
            work: "very_light" as const,
            leisure: "very_light" as const,
            routines: [],
          },
        },
        goal,
        preferences: {
          ...preferences,
          context: "Fictional case. I run almost every day.",
        },
      },
      clarify: true,
    },
    {
      id: "reported-bia-is-retained",
      input: {
        profile: {
          ...profile,
          bodyFat: { percent: 39, method: "bia" as const },
        },
        goal,
        preferences: {
          ...preferences,
          context:
            "Fictional case. My body-fat scale reading differs from a BMI formula estimate. Keep the scale measurement source visible.",
        },
      },
      clarify: false,
    },
    {
      id: "unknown-body-fat-is-estimated",
      input: {
        profile: { ...profile, bodyFat: null },
        goal,
        preferences: {
          ...preferences,
          context: "Fictional case. I have no body-fat measurement.",
        },
      },
      clarify: false,
    },
  ];
  await mkdir(dir, { recursive: true });
  await writeFile(
    `${dir}/protocol.json`,
    JSON.stringify(
      { frozenBeforeCalls: new Date().toISOString(), hashes, cases },
      null,
      2,
    ),
  );
  const selected = codexProvider(),
    summary = [];
  for (const item of cases) {
    const trace: Record<string, unknown> = {
      id: item.id,
      input: item.input,
      calls: [],
    };
    const provider: AgentProvider = {
      ...selected,
      async run(instructions, context, tools, handle, signal) {
        trace.instructions = instructions;
        trace.context = JSON.parse(context);
        trace.tools = tools;
        await selected.run(
          instructions,
          context,
          tools,
          async (name, args) => {
            const result = await handle(name, args);
            (trace.calls as unknown[]).push({ name, args, result });
            return result;
          },
          signal,
        );
      },
    };
    try {
      const review = await reviewInitialization(item.input, provider);
      trace.review = review;
      assert.equal(review.aiStatus, "completed");
      assert.equal(
        review.interpretation!.work,
        item.input.profile.activity.work,
      );
      assert.equal(
        review.interpretation!.leisure,
        item.input.profile.activity.leisure,
      );
      assert.equal(Boolean(review.interpretation!.clarification), item.clarify);
      assert.equal(
        review.baseline.bodyFatSource,
        item.input.profile.bodyFat ? "user_reported" : "jackson_reference",
      );
      summary.push({
        id: item.id,
        passed: true,
        clarification: review.interpretation!.clarification,
        pal: review.baseline.pal,
      });
    } catch (error) {
      trace.error = error instanceof Error ? error.message : String(error);
      summary.push({ id: item.id, passed: false, error: trace.error });
    }
    await writeFile(`${dir}/${item.id}.json`, JSON.stringify(trace, null, 2));
    console.log(item.id, summary.at(-1)!.passed ? "passed" : "failed");
  }
  const unchanged = (
    await Promise.all(
      files.map(
        async (f) =>
          createHash("sha256")
            .update(await readFile(f))
            .digest("hex") === hashes[f],
      ),
    )
  ).every(Boolean);
  await writeFile(
    `${dir}/summary.json`,
    JSON.stringify(
      {
        provider: selected.name,
        model: selected.model,
        sourceUnchangedDuringRun: unchanged,
        cases: summary,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { dir, sourceUnchangedDuringRun: unchanged, cases: summary },
      null,
      2,
    ),
  );
  if (!unchanged || summary.some((c) => !c.passed)) process.exitCode = 1;
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
