// ABOUTME: Regression controls for global week meaning and reuse of exact full-plan practices.
// ABOUTME: Synthetic providers test contracts and repair; they are not model-quality or human judgments.
import assert from "node:assert/strict";
import test from "node:test";
import {
  guidanceCalendar,
  associateGuidancePhases,
  referencedWeekSchema,
  resolveReferencedWeeks,
  weeklyHorizonIssues,
} from "../src/agent/weekly-guidance";
import {
  coherentStrategyTools,
  journeySourceTools,
  phaseGuidancePolicyIssues,
  simplificationPolicyIssues,
} from "../src/agent/phase-guidance";
import {
  generateJourneyContent,
  JOURNEY_CONTEXT_VERSION,
} from "../src/agent/journey-content";
import type { AgentProvider } from "../src/agent/session";
import { JourneyContentSchema } from "../src/domain/journey";
import { addDays } from "../src/domain/facts";
import {
  journeyAgentFixture,
  syntheticJourney,
  syntheticMovementJourney,
  syntheticGuidanceContent,
} from "./support/journey-agent";
import {
  alignSyntheticPractices,
  syntheticStrategy,
  syntheticReferencedWeeks,
} from "./support/plan-coherence";

test("equal work/leisure codes remain distinct current-activity facts with verbatim restoration", () => {
  const input = journeyAgentFixture();
  const content = syntheticJourney(input);
  const tools = journeySourceTools({
    ...input.sources,
    work: "moderate",
    leisure: "moderate",
  });
  const work = tools.options.find((o) => o.sourceId === "work")!;
  const leisure = tools.options.find((o) => o.sourceId === "leisure")!;
  assert.equal(work.quote, "moderate");
  assert.equal(leisure.quote, "moderate");
  assert.notEqual(work.sourceRef, leisure.sourceRef);
  assert.match(
    work.description!,
    /Current work-related physical activity intensity/,
  );
  assert.match(work.description!, /not working hours/);
  assert.match(
    leisure.description!,
    /Current non-work physical activity intensity/,
  );
  assert.match(leisure.description!, /not spare time/);
  assert.match(leisure.description!, /future exercise willingness/);
  const {
    weeks,
    goalStatus: _status,
    ...outline
  } = syntheticGuidanceContent(content);
  const references = [work, leisure].map((o) => ({
    sourceRef: o.sourceRef,
    reason:
      "Use the reported current activity category, not an estimate of available time.",
  }));
  outline.whyForYou = references;
  outline.phases[0].guidance!.evidence = references;
  const restored = tools.restore(tools.outlineSchema.parse(outline));
  assert.deepEqual(
    restored.whyForYou.map(({ sourceId, quote }) => ({ sourceId, quote })),
    [
      { sourceId: "work", quote: "moderate" },
      { sourceId: "leisure", quote: "moderate" },
    ],
  );
  assert.ok(restored.whyForYou.every((r) => !Object.hasOwn(r, "description")));
  assert.equal(
    JourneyContentSchema.safeParse({ ...restored, weeks: content.weeks })
      .success,
    true,
  );
});

test("actual generation context separates current activity meanings from future willingness without changing facts", async () => {
  const input = journeyAgentFixture();
  const original = structuredClone(input);
  const content = syntheticJourney(input);
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic-context-check",
    async run(_instructions, context, tools, handle) {
      const c = JSON.parse(context);
      assert.equal(c.contextVersion, JOURNEY_CONTEXT_VERSION);
      assert.equal(
        c.sourceContextVersion,
        "journey-sources-2026-10-30-activity-meaning-v1",
      );
      assert.match(c.activityInputMeanings.work, /not working hours/);
      assert.match(c.activityInputMeanings.leisure, /not spare time/);
      assert.match(
        c.activityInputMeanings.weeklyTrainingMinutes,
        /separately confirmed future/,
      );
      assert.equal(
        c.preferences.weeklyTrainingMinutes,
        input.preferences.availableTrainingMinutes,
      );
      for (const axis of ["work", "leisure"] as const) {
        const option = c.evidenceOptions.find(
          (o: { sourceId: string }) => o.sourceId === axis,
        );
        assert.equal(option.quote, input.profile.activity[axis]);
        assert.equal(option.description, c.activityInputMeanings[axis]);
      }
      assert.equal(
        (await handle(tools[0].name, syntheticGuidanceContent(content))).status,
        "ok",
      );
    },
  };
  assert.deepEqual(await generateJourneyContent(input, provider), content);
  assert.deepEqual(input, original);
});

test("fewer-actions cannot hide the dropped portion duty in a substitution fallback or later phase", () => {
  const previous = syntheticJourney(journeyAgentFixture());
  previous.weeks[0].actions[0].details = "先盛少量主食，停顿再决定是否加添。";
  previous.weeks[0].actions.push({
    ...previous.weeks[0].actions[0],
    key: "dish-swap",
    details: "点餐时用蔬菜豆腐替换部分油重菜品。",
  });
  const next = structuredClone(previous);
  const g = next.phases[0].guidance!;
  g.commitments = ["点餐时用蔬菜豆腐替换部分油重菜品。"];
  g.obstacles = [
    {
      barrier: "可替换的菜品不足。",
      alternative: "在已有菜品中选择；家餐时可自行盛少量主食并停顿再决定。",
    },
  ];
  g.progression.discussChangeWhen = "若选择反复受阻，则讨论落回份量停顿。";
  assert.ok(
    simplificationPolicyIssues(next, previous).some((s) =>
      s.includes("obstacles.0.alternative"),
    ),
  );
  assert.ok(
    simplificationPolicyIssues(next, previous).some((s) =>
      s.includes("progression.discussChangeWhen"),
    ),
  );
  g.obstacles[0].alternative =
    "若没有可替换的菜品，保留正常餐食，周末讨论获取障碍。";
  g.progression.discussChangeWhen =
    "若反复受阻，讨论更可得的选择或日期，不再要求份量停顿。";
  assert.deepEqual(simplificationPolicyIssues(next, previous), []);
  g.commitments = ["先盛少量并停顿，再用蔬菜替换油重菜。"];
  assert.match(
    simplificationPolicyIssues(next, previous).join(" "),
    /both still mandatory/,
  );
});

test("a real meal-pause duration is not a workout; exercise durations remain guarded", () => {
  const content = syntheticJourney(journeyAgentFixture());
  for (const text of [
    "每餐盛饭时，放下筷子停顿 30 秒至 1 分钟，再按饱腹感决定是否加餐。",
    "At a meal, pause for 1 minute before deciding on seconds.",
    "饭后 15-20 分钟是否感到舒适饱足、无持续空腹感？",
    "在食堂或外卖时，先盛正常主食，吃完停顿一分钟再决定是否加饭。",
  ]) {
    content.phases[0].guidance!.commitments = [text];
    assert.deepEqual(phaseGuidancePolicyIssues(content, 60), []);
  }
  for (const text of [
    "饭后散步 30 分钟，进食时可以停顿。",
    "After eating, walk for 30 minutes; pause before seconds.",
    "Plan a 30-minute session.",
    "午餐后打篮球30分钟，再回忆饱腹感。",
  ]) {
    content.phases[0].guidance!.commitments = [text];
    assert.ok(phaseGuidancePolicyIssues(content, 60).length);
  }
});

test("global week positions survive batching, partial weeks and phase-crossing slots", () => {
  const input = journeyAgentFixture(112);
  const content = syntheticJourney(input);
  const phase = content.phases[0];
  const split = addDays(input.binding.startsOn, 8);
  const phases = [
    { ...phase, endsOn: split },
    { ...phase, startsOn: addDays(split, 1), label: "Consolidate" },
  ];
  const slots = associateGuidancePhases(
    guidanceCalendar(input.binding, 60, [30]),
    phases,
  );
  assert.equal(slots.length, 17);
  assert.deepEqual(
    slots.map((s) => s.weekIndex),
    Array.from({ length: 17 }, (_, i) => i + 1),
  );
  assert.ok(slots.every((s) => s.totalWeeks === 17));
  assert.equal(slots.slice(5, 10)[0].weekIndex, 6);
  assert.equal(slots.filter((s) => s.isFinalWeek).length, 1);
  assert.equal(slots.at(-1)!.isFinalWeek, true);
  assert.equal(slots[0].activeDates[0], input.binding.startsOn);
  const crossing = slots.find((s) => s.phases.length === 2)!;
  assert.ok(crossing);
  assert.deepEqual(
    crossing.phases.flatMap((p) => p.activeDates),
    crossing.activeDates,
  );
  assert.ok(slots.every((s) => s.phases.length > 0));
});

test("a whole-cycle checkpoint cannot escape from an earlier batch in either language", () => {
  const input = journeyAgentFixture(112);
  const content = syntheticJourney(input);
  const slots = guidanceCalendar(input.binding, 60, [30]);
  content.weeks[4].focus = "目标日期前复盘整个周期";
  assert.match(
    weeklyHorizonIssues(content.weeks, slots).join(" "),
    /global week 5 of 17/,
  );
  content.weeks[4].focus = "Review the whole cycle";
  assert.equal(weeklyHorizonIssues(content.weeks, slots).length, 1);
  content.weeks[4].focus = "Review what fits so far";
  content.weeks.at(-1)!.focus = "复盘整个周期，讨论后续";
  assert.deepEqual(weeklyHorizonIssues(content.weeks, slots), []);
});

test("practice references restore the same portions and fallback in every phase and week", async () => {
  const input = journeyAgentFixture(112);
  const full = alignSyntheticPractices(syntheticMovementJourney(input));
  let batchCount = 0;
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run(_p, context, tools, handle) {
      const c = JSON.parse(context);
      if (tools[0].name === "present_strategy") {
        assert.equal(c.weeklyTemplateScope.actualFinalSlot.weekIndex, 17);
        const premature = syntheticStrategy(full);
        premature.phases.at(-1)!.weeklyFocus = "完成全程复核，讨论后续决定。";
        premature.phases.at(-1)!.weeklyCheckInLabel = "全程复核与决定";
        const rejected = await handle(tools[0].name, premature);
        assert.equal(rejected.status, "rejected");
        assert.match(
          JSON.stringify(rejected),
          /weeklyFocus|weeklyCheckInLabel/,
        );
        assert.equal(
          (await handle(tools[0].name, syntheticStrategy(full))).status,
          "ok",
        );
        return;
      }
      batchCount++;
      const selected = full.weeks.filter((w) =>
        c.requiredWeeks.some(
          (s: { weekStart: string }) => s.weekStart === w.weekStart,
        ),
      );
      assert.equal(c.requiredWeeks[0].weekIndex, (batchCount - 1) * 5 + 1);
      assert.equal(c.requiredWeeks[0].totalWeeks, 17);
      assert.ok(
        c.requiredWeeks.every((s: { phases: unknown[] }) => s.phases.length),
      );
      assert.equal(c.strategy.summary, full.summary);
      const payload = { weeks: syntheticReferencedWeeks(selected) };
      const drift = structuredClone(payload);
      Object.assign(drift.weeks[0].actions[0], {
        details: "先盛半碗，下一阶段只吃一口蛋白。",
      });
      assert.equal((await handle(tools[0].name, drift)).status, "rejected");
      assert.equal((await handle(tools[0].name, payload)).status, "ok");
    },
  };
  const result = await generateJourneyContent(input, provider);
  assert.equal(batchCount, 4);
  assert.deepEqual(result, full);
  assert.equal(JourneyContentSchema.safeParse(result).success, true);
  assert.equal("practices" in result, false);
  assert.ok(
    result.weeks.every(
      (w) => w.actions[0].details === result.phases[0].guidance!.commitments[0],
    ),
  );
});

test("unknown, repeated or out-of-phase practice references and movement budgets are rejected", () => {
  const input = journeyAgentFixture(112);
  const { goalStatus: _goalStatus, ...strategy } = syntheticStrategy(
    alignSyntheticPractices(syntheticJourney(input)),
  );
  const tools = coherentStrategyTools(journeySourceTools(input.sources), 3);
  const parsed = tools.outlineSchema.parse(strategy);
  const repair = tools.repairIssues(parsed, [
    "phases.0.guidance.commitments.0: duration issue",
    "phases.0.guidance.obstacles.0.alternative: duration issue",
  ]);
  assert.deepEqual(repair, [
    "practices.0.details: duration issue",
    "practices.0.fallback: duration issue",
  ]);
  parsed.phases[0].guidance.practiceIds = ["p2"];
  assert.match(tools.issues(parsed).join(" "), /existing practices/);
  parsed.phases[0].guidance.practiceIds = ["p1", "p1"];
  assert.match(tools.issues(parsed).join(" "), /once each/);
  const practices = tools.outlineSchema.parse(strategy).practices;
  const slot = {
    ...guidanceCalendar(input.binding, 60, [30])[1],
    maxCommitments: 1,
    allowedPracticeIds: ["p1"],
    focus: "Continue the current phase.",
    checkInLabel: "Weekly fit review",
  };
  const week = syntheticReferencedWeeks(syntheticJourney(input).weeks)[1];
  assert.equal(
    referencedWeekSchema(practices, 1).safeParse({
      ...week,
      focus: "起步第1周",
      checkInLabel: "第17周复盘",
    }).success,
    false,
  );
  assert.equal(
    referencedWeekSchema(practices, 1).safeParse({
      ...week,
      actions: [{ practiceId: "p9", activityOptionIds: [] }],
    }).success,
    false,
  );
  assert.match(
    resolveReferencedWeeks(
      [week],
      practices,
      [{ ...slot, allowedPracticeIds: [] }],
      60,
    ).issues.join(" "),
    /allowedPracticeIds/,
  );
  const movement = { ...practices[0], kind: "movement" as const };
  const moving = {
    ...week,
    actions: [{ practiceId: "p1" as const, activityOptionIds: ["m30x3"] }],
  };
  assert.ok(
    resolveReferencedWeeks([moving], [movement], [slot], 60).issues.length,
  );
});

test("a food practice cannot receive an activity option at the tool schema boundary", () => {
  const full = alignSyntheticPractices(
    syntheticJourney(journeyAgentFixture(112)),
  );
  const practices = syntheticStrategy(full).practices;
  assert.equal(practices[0].kind, "nutrition");
  const schema = referencedWeekSchema(practices, 3);
  assert.equal(
    schema.safeParse({
      actions: [{ practiceId: "p1", activityOptionIds: ["m30x2"] }],
    }).success,
    false,
  );
  assert.equal(
    schema.safeParse({ actions: [{ practiceId: "p1", activityOptionIds: [] }] })
      .success,
    true,
  );
  const json = JSON.stringify(schema.toJSONSchema());
  assert.match(json, /maxItems\":0/);
});
