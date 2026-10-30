// ABOUTME: Exercises execution authority and actual provider context using fictional records.
// ABOUTME: Synthetic providers test runtime controls, not real model reliability.
import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays,
  type CoachInput,
  type ContextAssessment,
  type PlanPresentation,
} from "../src/domain/contracts";
import { presentationFor } from "./support/presentation";
import { exampleRequest } from "../src/domain/example";
import { runCoach, type AgentProvider } from "../src/agent/session";
import { nebiusProvider } from "../src/agent/providers/nebius";

const today = "2026-10-28";
const assessment: ContextAssessment = {
  applicability: "standard",
  reason: null,
  constraints: [],
  signals: [],
};
const copy: PlanPresentation = presentationFor(exampleRequest(today));
const pausedCopy: PlanPresentation = {
  explanation: {
    headline: "Pause weight-loss planning",
    summary: "This situation needs guidance outside this adult demo.",
    changes: ["Context review paused numerical planning."],
    question: null,
    whyForecast:
      "No numerical loss forecast is issued because the situation is outside the supported scope.",
  },
  newWeeks: [],
  actionChanges: [],
};
function provider(run: AgentProvider["run"]): AgentProvider {
  return { name: "codex", model: "synthetic-contract-test", run };
}

test("context review, calculation and final copy must succeed in order", async () => {
  const model = provider(async (_instructions, _context, tools, handle) => {
    assert.deepEqual(
      tools.map((tool) => tool.name),
      ["review_context", "forecast", "present_plan"],
    );
    assert.equal((await handle("present_plan", copy)).status, "rejected");
    assert.equal((await handle("forecast", {})).status, "rejected");
    assert.equal((await handle("review_context", assessment)).status, "ok");
    assert.equal((await handle("present_plan", copy)).status, "rejected");
    assert.equal((await handle("forecast", {})).status, "ok");
    assert.equal((await handle("present_plan", copy)).status, "ok");
  });
  const result = await runCoach(exampleRequest(today), model);
  assert.ok(result.forecast);
  assert.equal(result.forecast.modelResults[0].id, "hall");
  assert.deepEqual(result.explanation, copy.explanation);
  assert.ok(result.targetRevisions.length > 0);
});
test("a provider stopping before submission cannot return a partial result", async () => {
  const model = provider(async (_instructions, _context, _tools, handle) => {
    await handle("review_context", assessment);
    await handle("forecast", {});
  });
  await assert.rejects(
    runCoach(exampleRequest(today), model),
    /did not complete/i,
  );
});
test("only registered tools run and a turn permits at most eight tool attempts", async () => {
  const unknown = provider(async (_instructions, _context, _tools, handle) => {
    await handle("shell", {});
  });
  await assert.rejects(
    runCoach(exampleRequest(today), unknown),
    /unregistered/i,
  );
  const looping = provider(async (_instructions, _context, _tools, handle) => {
    for (let i = 0; i < 9; i++) await handle("review_context", assessment);
  });
  await assert.rejects(runCoach(exampleRequest(today), looping), /budget/i);
});
test("forecast overrides are rejected and an empty-argument calculation can recover", async () => {
  const model = provider(async (_instructions, _context, tools, handle) => {
    assert.equal(
      tools.find((tool) => tool.name === "forecast")!.inputSchema
        .additionalProperties,
      false,
    );
    assert.equal((await handle("review_context", assessment)).status, "ok");
    assert.equal(
      (await handle("forecast", { dailyCalories: 600, activity: "high" }))
        .status,
      "rejected",
    );
    assert.equal((await handle("present_plan", copy)).status, "rejected");
    assert.equal((await handle("forecast", {})).status, "ok");
    assert.equal((await handle("present_plan", copy)).status, "ok");
  });
  const result = await runCoach(exampleRequest(today), model);
  assert.ok(result.forecast);
  assert.equal(result.forecast.baseline.pal, 1.6);
  assert.notEqual(result.targetRevisions[0].dailyCalories, 600);
});
test("context evidence needs both an existing source and an exact quote", async () => {
  const model = provider(async (_instructions, _context, _tools, handle) => {
    const constraint = {
      kind: "allergy",
      label: "peanut",
      scope: "ongoing",
      untilDate: null,
      evidence: [
        {
          sourceId: "profile.preferences",
          quote: "I have a severe peanut allergy.",
        },
      ],
    };
    assert.equal(
      (
        await handle("review_context", {
          ...assessment,
          constraints: [constraint],
        })
      ).status,
      "rejected",
    );
    assert.equal(
      (
        await handle("review_context", {
          ...assessment,
          constraints: [
            {
              ...constraint,
              evidence: [
                { sourceId: "nonexistent-source", quote: "No seafood." },
              ],
            },
          ],
        })
      ).status,
      "rejected",
    );
    assert.equal((await handle("review_context", assessment)).status, "ok");
    assert.equal((await handle("forecast", {})).status, "ok");
    assert.equal((await handle("present_plan", copy)).status, "ok");
  });
  const result = await runCoach(exampleRequest(today), model);
  assert.ok(
    !result.context.constraints.some((item) => item.label === "peanut"),
  );
  assert.ok(
    result.context.constraints.some((item) => item.label === "seafood"),
  );
});
test("required explanation, excluded food and numeric prose are rejected before corrected copy", async () => {
  const model = provider(async (_instructions, _context, _tools, handle) => {
    await handle("review_context", assessment);
    await handle("forecast", {});
    const { whyForecast: _explanation, ...missingExplanation } =
      copy.explanation;
    assert.equal(
      (
        await handle("present_plan", {
          ...copy,
          explanation: missingExplanation,
        })
      ).status,
      "rejected",
    );
    assert.equal(
      (
        await handle("present_plan", {
          ...copy,
          newWeeks: copy.newWeeks.map((week, i) =>
            i
              ? week
              : {
                  ...week,
                  actions: week.actions.map((action) => ({
                    ...action,
                    title: "Choose grilled salmon with rice for lunch.",
                  })),
                },
          ),
        })
      ).status,
      "rejected",
    );
    assert.equal(
      (
        await handle("present_plan", {
          ...copy,
          explanation: {
            ...copy.explanation,
            summary: "Eat 1400 kcal every day.",
          },
        })
      ).status,
      "rejected",
    );
    assert.equal((await handle("present_plan", copy)).status, "ok");
  });
  const result = await runCoach(exampleRequest(today), model);
  assert.deepEqual(result.explanation, copy.explanation);
});
test("pregnancy pauses numbers even when the model omits the source-backed signal", async () => {
  const request = exampleRequest(today);
  request.preferences.context =
    "I am pregnant. Please keep my records while I seek appropriate guidance.";
  const model = provider(async (_instructions, _context, _tools, handle) => {
    assert.equal((await handle("review_context", assessment)).status, "ok");
    assert.equal((await handle("forecast", {})).status, "ok");
    assert.equal(
      (
        await handle("present_plan", {
          ...pausedCopy,
          explanation: {
            ...pausedCopy.explanation,
            summary: "Create a calorie deficit by eating less.",
          },
        })
      ).status,
      "rejected",
    );
    assert.equal((await handle("present_plan", pausedCopy)).status, "ok");
  });
  const result = await runCoach(request, model);
  assert.equal(result.forecast, null);
  assert.equal(result.decision.status, "paused");
  assert.equal(result.context.applicability, "unsupported");
  assert.ok(result.context.signals.some((item) => item.kind === "unsupported"));
  assert.deepEqual(result.newWeeks, []);
});
test("an old ongoing constraint reaches the provider beyond the recent-entry window", async () => {
  const request: CoachInput = exampleRequest(today);
  const startDate = addDays(today, -20);
  request.profile = {
    ...request.profile,
    startDate,
  };
  request.goal.requestedDate = addDays(startDate, 84);
  request.preferences.mealSchedules[0].effectiveFrom = startDate;
  request.action = "update";
  request.previousExplanation = copy.explanation;
  request.targetRevisions = [
    {
      effectiveFrom: startDate,
      dailyCalories: 1825,
      targetDate: request.goal.requestedDate!,
      mode: "loss",
      goalId: request.goal.id,
    },
  ];
  request.previousNumbers = {
    dailyCalories: 1825,
    targetDate: request.goal.requestedDate!,
    projectedWeightKg: 69,
  };
  request.logs = Array.from({ length: 20 }, (_, i) => ({
    date: addDays(startDate, i),
    weightKg: null,
    intake: null,
    bodyFat: null,
    steps: null,
    activity: null,
    notes: i === 0 ? "I have a severe peanut allergy." : `Routine note ${i}.`,
  }));
  const model = provider(async (_instructions, rawContext, _tools, handle) => {
    const delivered = JSON.parse(rawContext);
    assert.equal(delivered.recentDailyEntries.length, 14);
    assert.ok(
      !delivered.recentDailyEntries.some((entry: { notes: string }) =>
        entry.notes.includes("peanut"),
      ),
    );
    const oldSource = delivered.contextSources.find(
      (source: { id: string }) => source.id === `log:${startDate}`,
    );
    assert.equal(oldSource?.text, "I have a severe peanut allergy.");
    assert.deepEqual(delivered.targetRevisions, request.targetRevisions);
    assert.deepEqual(delivered.previousNumbers, request.previousNumbers);
    // Provider omits the constraint; authoritative old text must still enforce it.
    assert.equal((await handle("review_context", assessment)).status, "ok");
    assert.equal((await handle("forecast", {})).status, "ok");
    assert.equal(
      (
        await handle("present_plan", {
          ...copy,
          newWeeks: copy.newWeeks.map((week, i) =>
            i
              ? week
              : {
                  ...week,
                  actions: week.actions.map((action) => ({
                    ...action,
                    title: "Add peanut butter to breakfast.",
                  })),
                },
          ),
        })
      ).status,
      "rejected",
    );
    assert.equal((await handle("present_plan", copy)).status, "ok");
  });
  const result = await runCoach(request, model);
  assert.ok(
    result.context.constraints.some(
      (item) => item.kind === "allergy" && item.label === "peanut",
    ),
  );
  assert.ok(result.forecast);
  assert.equal(result.targetRevisions[0].dailyCalories, 1825);
  assert.deepEqual(result.targetRevisions, request.targetRevisions);
});
test("Nebius performs the same three-tool protocol and receives earlier tool results", async () => {
  const originalFetch = globalThis.fetch;
  const keys = ["NEBIUS_API_KEY", "NEBIUS_BASE_URL", "NEBIUS_MODEL"] as const;
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  process.env.NEBIUS_API_KEY = "test-key-not-a-real-credential";
  process.env.NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1";
  process.env.NEBIUS_MODEL = "nvidia/nemotron-3-super-120b-a12b";
  let count = 0;
  globalThis.fetch = async (input, init) => {
    assert.equal(
      String(input),
      "https://api.tokenfactory.nebius.com/v1/chat/completions",
    );
    const body = JSON.parse(init!.body as string);
    assert.equal(body.model, "nvidia/nemotron-3-super-120b-a12b");
    assert.deepEqual(
      body.tools.map(
        (tool: { function: { name: string } }) => tool.function.name,
      ),
      ["review_context", "forecast", "present_plan"],
    );
    if (count === 0) {
      const delivered = JSON.parse(
        body.messages.find(
          (message: { role: string }) => message.role === "user",
        ).content,
      );
      assert.ok(
        delivered.contextSources.some(
          (source: { id: string }) => source.id === "profile.preferences",
        ),
      );
    } else {
      assert.equal(body.messages.at(-1).role, "tool");
      assert.equal(JSON.parse(body.messages.at(-1).content).status, "ok");
    }
    const name = ["review_context", "forecast", "present_plan"][count++];
    assert.ok(name, "The adapter must stop after successful presentation.");
    const args =
      name === "review_context" ? assessment : name === "forecast" ? {} : copy;
    return Response.json({
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: `call-${count}`,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
  };
  try {
    const result = await runCoach(exampleRequest(today), nebiusProvider());
    assert.deepEqual(result.toolCalls, [
      "review_context",
      "forecast",
      "present_plan",
    ]);
    assert.equal(result.provider, "nebius");
    assert.equal(count, 3);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("a real acceptance-path misreading cannot call the logged pattern the accepted-plan outcome", async () => {
  const request = exampleRequest(today);
  request.goal.value = 69;
  request.targetRevisions = [
    {
      effectiveFrom: request.profile.startDate,
      dailyCalories: 1850,
      targetDate: request.goal.requestedDate!,
      mode: "loss",
      goalId: request.goal.id,
    },
  ];
  const model = provider(async (_i, _c, _t, handle) => {
    await handle("review_context", assessment);
    const result = await handle("forecast", {});
    const outcomes = result.scenarioOutcomes as {
      followingAcceptedTargets: { withinGoal: boolean };
      continuingLoggedPattern: { withinGoal: boolean };
    };
    assert.equal(outcomes.followingAcceptedTargets.withinGoal, true);
    assert.equal(outcomes.continuingLoggedPattern.withinGoal, false);
    const wrong = await handle("present_plan", {
      ...copy,
      explanation: {
        ...copy.explanation,
        summary: "The logged pattern projects within the updated timeline.",
      },
    });
    assert.equal(wrong.status, "rejected");
    assert.match(
      JSON.stringify(wrong),
      /logged-pattern scenario does not meet/,
    );
    assert.equal(
      (
        await handle("present_plan", {
          ...copy,
          explanation: {
            ...copy.explanation,
            summary:
              "The accepted-plan and logged-pattern scenarios have different assumptions; the logged pattern misses the goal.",
          },
        })
      ).status,
      "ok",
    );
  });
  const result = await runCoach(request, model);
  assert.ok(result.forecast);
});
