// ABOUTME: Full-horizon and feedback invariants at the model boundary using explicit synthetic providers.
// ABOUTME: These tests measure the orchestration contract, not real model usefulness.
import assert from "node:assert/strict";
import test from "node:test";
import { generateJourneyContent } from "../src/agent/journey-content";
import { UNMET_GOAL_NOTICE } from "../src/planning/journey-feasibility";
import {
  guidanceCalendar,
  resolveGuidanceWeeks,
  GuidanceWeekSchema,
} from "../src/agent/weekly-guidance";
import { generationInput } from "../src/agent/stage-router";
import type { AgentProvider } from "../src/agent/session";
import type { JourneyContent } from "../src/domain/journey";
import {
  alignSyntheticPractices,
  syntheticStrategy,
  syntheticReferencedWeeks,
} from "./support/plan-coherence";
import {
  journeyAgentFixture,
  journeyStageFixture,
  syntheticJourney,
  syntheticMovementJourney,
  syntheticGuidanceContent,
  syntheticGuidanceWeeks,
} from "./support/journey-agent";
test("a short complete proposal uses actual calculator context and one validated submission", async () => {
  const input = journeyAgentFixture();
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run(_p, context, tools, h) {
      const c = JSON.parse(context);
      assert.equal(
        c.calculator.forecastInputHash,
        input.calculation.forecastInputHash,
      );
      assert.equal(c.preferences.weeklyTrainingMinutes, 60);
      assert.equal(c.feedback, null);
      assert.equal(
        (
          await h(
            tools[0].name,
            syntheticGuidanceContent(syntheticJourney(input)),
          )
        ).status,
        "ok",
      );
    },
  };
  const r = await generateJourneyContent(input, provider);
  assert.equal(r.weeks.length, 4);
});
test("a long horizon is assembled in bounded batches without losing a partial week or checkpoint", async () => {
  const input = journeyAgentFixture(83),
    full = alignSyntheticPractices(syntheticMovementJourney(input));
  const names: string[] = [];
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run(_p, context, tools, h) {
      const c = JSON.parse(context),
        name = tools[0].name;
      names.push(name);
      const outline = syntheticStrategy(full);
      const value =
        name === "present_strategy"
          ? outline
          : {
              weeks: syntheticReferencedWeeks(
                full.weeks.filter((w) =>
                  c.requiredWeeks.some(
                    (x: { weekStart: string }) => w.weekStart === x.weekStart,
                  ),
                ),
              ),
            };
      assert.equal((await h(name, value)).status, "ok");
    },
  };
  const r = await generateJourneyContent(input, provider);
  assert.deepEqual(r, full);
  assert.equal(names[0], "present_strategy");
  assert.ok(names.filter((n) => n === "present_weeks").length > 1);
  assert.equal(r.weeks.at(-1)?.checkIn.date, r.weeks.at(-1)?.weekStart);
});
test("long revision batches expose the fewer-commitments limit before inference", async () => {
  const input = journeyAgentFixture(83);
  const good = alignSyntheticPractices(syntheticMovementJourney(input));
  const previous = structuredClone(good);
  for (const week of previous.weeks)
    week.actions.push({
      ...week.actions[0],
      key: week.actions[0].key + "-extra",
      title: "A separate dinner task",
    });
  input.previousDraft = {
    id: "preceding-long-draft",
    binding: input.binding,
    feedbackRevision: 0,
    content: previous,
  };
  input.feedback = {
    draftId: "preceding-long-draft",
    sourceRevision: 0,
    priorities: ["fewer_actions"],
    availableTrainingMinutes: null,
    requestedGoalDate: null,
    notes: "One coordinated practice rather than separate tasks.",
  };
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run(_p, context, tools, handle) {
      const c = JSON.parse(context);
      const outline = syntheticStrategy(good);
      if (tools[0].name === "present_strategy") {
        assert.deepEqual(c.previousDraft, previous);
        assert.deepEqual(c.feedback, input.feedback);
        assert.equal(c.practiceLimit, 1);
        assert.equal((await handle(tools[0].name, outline)).status, "ok");
        return;
      }
      assert.deepEqual(c.previousDraft, previous);
      const schema = tools[0].inputSchema as {
        properties: {
          weeks: { items: { properties: { actions: { maxItems: number } } } };
        };
      };
      assert.equal(
        schema.properties.weeks.items.properties.actions.maxItems,
        1,
      );
      const inBatch = (w: JourneyContent["weeks"][number]) =>
        c.requiredWeeks.some(
          (s: { weekStart: string }) => s.weekStart === w.weekStart,
        );
      assert.notEqual(
        (
          await handle(tools[0].name, {
            weeks: syntheticReferencedWeeks(previous.weeks.filter(inBatch)),
          })
        ).status,
        "ok",
      );
      assert.equal(
        (
          await handle(tools[0].name, {
            weeks: syntheticReferencedWeeks(good.weeks.filter(inBatch)),
          })
        ).status,
        "ok",
      );
    },
  };
  assert.deepEqual(await generateJourneyContent(input, provider), good);
});
test("a nutrition-only long plan restores every week from the validated strategy without paid reference selection", async () => {
  const input = journeyAgentFixture(112);
  const full = alignSyntheticPractices(syntheticJourney(input));
  const names: string[] = [];
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run(_p, _context, tools, handle) {
      names.push(tools[0].name);
      assert.equal(
        (await handle(tools[0].name, syntheticStrategy(full))).status,
        "ok",
      );
    },
  };
  const result = await generateJourneyContent(input, provider);
  assert.deepEqual(names, ["present_strategy"]);
  assert.deepEqual(result, full);
  assert.equal(result.weeks.length, 17);
  assert.ok(
    result.weeks.every(
      (w) => w.actions[0].details === result.phases[0].guidance!.commitments[0],
    ),
  );
});
test("an exhausted third feedback round or wrong calculator binding fails before inference", async () => {
  let calls = 0;
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run() {
      calls++;
    },
  };
  const input = journeyAgentFixture();
  input.previousDraft = {
    id: "third",
    binding: input.binding,
    content: syntheticJourney(input),
    feedbackRevision: 3,
  };
  input.feedback = {
    draftId: "third",
    sourceRevision: 0,
    priorities: ["less_time"],
    availableTrainingMinutes: 0,
    requestedGoalDate: null,
    notes: "No training time.",
  };
  await assert.rejects(
    generateJourneyContent(input, provider),
    /three feedback/,
  );
  input.binding.forecastInputHash = "0".repeat(64);
  await assert.rejects(
    generateJourneyContent(input, provider),
    /calculator snapshot/,
  );
  assert.equal(calls, 0);
});
test("food restrictions also guard fallback advice; failed partial output is never a complete journey", async () => {
  const input = journeyAgentFixture(21, "I have a peanut allergy. No seafood.");
  const wrong = syntheticJourney(input);
  wrong.weeks[0].actions[0].fallback = "Choose peanut butter on toast instead.";
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run(_p, _c, _t, h) {
      const r = await h("present_journey", syntheticGuidanceContent(wrong));
      assert.equal(r.status, "rejected");
      assert.match(JSON.stringify(r), /excluded peanut/);
    },
  };
  await assert.rejects(
    generateJourneyContent(input, provider),
    /did not submit/,
  );
});
test("an unreachable requested date is disclosed from the calculator, not hidden behind a generic routine", async () => {
  const input = generationInput(journeyStageFixture(7, undefined, 72).request),
    value = syntheticJourney(input);
  value.summary =
    "Repeat the routine without a calculator feasibility disclosure.";
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run(_p, context, t, h) {
      const c = JSON.parse(context);
      assert.equal(c.feasibility.goalReachedAtHorizon, false);
      assert.equal(
        (await h(t[0].name, syntheticGuidanceContent(value))).status,
        "rejected",
      );
      value.summary =
        UNMET_GOAL_NOTICE + " Review timing before accepting the routine.";
      assert.equal(
        (await h(t[0].name, syntheticGuidanceContent(value))).status,
        "ok",
      );
    },
  };
  assert.ok(
    (await generateJourneyContent(input, provider)).summary.includes(
      UNMET_GOAL_NOTICE,
    ),
  );
});
test("numeric prose repair identifies the exact content field without changing calculator values", async () => {
  const input = journeyAgentFixture(),
    value = syntheticJourney(input),
    summary = value.summary;
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run(_p, _c, t, h) {
      value.summary = "Eat 1800 kcal each day.";
      const reply = await h(t[0].name, syntheticGuidanceContent(value));
      assert.equal(reply.status, "rejected");
      assert.match(JSON.stringify(reply), /summary: Numerical/);
      value.summary = summary;
      assert.equal(
        (await h(t[0].name, syntheticGuidanceContent(value))).status,
        "ok",
      );
    },
  };
  await generateJourneyContent(input, provider);
});
test("a summary cut off at its character budget needs model repair instead of being presented as complete", async () => {
  const input = journeyAgentFixture();
  const good = syntheticJourney(input);
  const cut = structuredClone(good);
  cut.summary = "Keep familiar meals and";
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run(_p, _c, tools, handle) {
      const rejected = await handle(
        tools[0].name,
        syntheticGuidanceContent(cut),
      );
      assert.equal(rejected.status, "rejected");
      assert.match(JSON.stringify(rejected), /complete sentence/);
      assert.equal(
        (await handle(tools[0].name, syntheticGuidanceContent(good))).status,
        "ok",
      );
    },
  };
  assert.deepEqual(await generateJourneyContent(input, provider), good);
});

test("weekly guidance cannot turn two half-hour walks into three dates or exceed a shared budget", () => {
  const input = journeyAgentFixture(28);
  const slots = guidanceCalendar(input.binding, 60, [30]);
  const slot = slots.find((s) => s.activeDates.length === 7)!;
  const movement = {
    kind: "movement" as const,
    title: "Keep the usual walks",
    details: "Use the familiar route when it fits your week.",
    fallback: "Resume the usual route next week if this week is disrupted.",
    successCheck: "Did the routine fit your week?",
    activityOptionIds: ["m30x2"],
  };
  const proposed = {
    focus: "Keep a manageable routine.",
    actions: [movement],
    checkInLabel: "Your weekly reflection",
  };
  assert.ok(GuidanceWeekSchema.safeParse(proposed).success);
  assert.equal(
    GuidanceWeekSchema.safeParse({ ...proposed, weekStart: "2026-01-01" })
      .success,
    false,
  );
  assert.match(
    resolveGuidanceWeeks([], [slot], 60).issues.join(" "),
    /exactly 1 weekly item/,
  );
  assert.equal(
    GuidanceWeekSchema.safeParse({
      ...proposed,
      actions: [{ ...movement, dates: slot.activeDates.slice(0, 3) }],
    }).success,
    false,
  );
  const result = resolveGuidanceWeeks([proposed], [slot], 60);
  assert.deepEqual(result.issues, []);
  assert.equal(result.weeks[0].actions[0].dates.length, 2);
  assert.equal(result.weeks[0].actions[0].plannedMinutes, 30);
  assert.equal(new Set(result.weeks[0].actions[0].dates).size, 2);
  const overspend = resolveGuidanceWeeks(
    [{ ...proposed, actions: [movement, movement] }],
    [slot],
    60,
  );
  assert.match(overspend.issues.join(" "), /120 minutes.*60/);
  const invalid = resolveGuidanceWeeks(
    [{ ...proposed, actions: [{ ...movement, activityOptionIds: ["m30x3"] }] }],
    [slot],
    60,
  );
  assert.ok(invalid.issues.length);
  const preceding = structuredClone(result.weeks);
  preceding[0].actions[0].key = "stable-existing-walk";
  preceding[0].actions[0].dates = slot.activeDates.slice(1, 3);
  preceding[0].checkIn.date = slot.activeDates[3];
  const revised = resolveGuidanceWeeks([proposed], [slot], 60, preceding);
  assert.deepEqual(revised.weeks, preceding);
});
test("zero capacity and partial weeks keep truthful, in-range checkpoints and activity options", () => {
  const input = journeyAgentFixture(21);
  const slots = guidanceCalendar(input.binding, 0, [30]);
  assert.ok(slots.every((s) => s.activityOptions.length === 0));
  assert.equal(slots[0].checkInDate, input.binding.startsOn);
  assert.ok(slots.every((s) => s.activeDates.includes(s.checkInDate)));
  const nutrition = syntheticGuidanceWeeks(syntheticJourney(input).weeks);
  const resolved = resolveGuidanceWeeks(nutrition, slots, 0);
  assert.deepEqual(resolved.issues, []);
  assert.ok(
    resolved.weeks.every((w) =>
      w.actions.every(
        (a) => a.kind === "nutrition" && a.plannedMinutes === null,
      ),
    ),
  );
  const singleDay = guidanceCalendar(
    { ...input.binding, endsOn: input.binding.startsOn },
    60,
    [30],
  );
  assert.ok(singleDay[0].activityOptions.every((o) => o.occurrences === 1));
  const invalid = resolveGuidanceWeeks(
    [
      {
        ...nutrition[0],
        actions: [
          {
            ...nutrition[0].actions[0],
            kind: "movement",
            activityOptionIds: ["m30x2"],
          },
        ],
      },
    ],
    singleDay,
    60,
  );
  assert.match(invalid.issues.join(" "), /1 active day/);
  assert.match(invalid.issues.join(" "), /m30x1/);
  assert.match(invalid.issues.join(" "), /empty array is invalid/);
});
