// ABOUTME: Actual trace regressions for diary negation, food exclusions and source-grounded journey copy.
// ABOUTME: A negative clause never authorizes a later positive diary, weighing or excluded-food instruction.
import assert from "node:assert/strict";
import test from "node:test";
import { explanationIssues } from "../src/domain/context";
import { journeyAgentFixture, syntheticJourney } from "./support/journey-agent";
import {
  alignSyntheticPractices,
  syntheticStrategy,
} from "./support/plan-coherence";
import { generateJourneyContent } from "../src/agent/journey-content";
import type { AgentProvider } from "../src/agent/session";
import {
  journeyGroundingIssues,
  measurementOnlyIssues,
} from "../src/agent/copy-policy";

const observedNoDiaryCheck =
  "本周工作日午餐是否都包含蔬菜和蛋白质，且未进行称重或热量记录";
test("Chinese past negation permits the actual no-diary check without hiding a following positive instruction", () => {
  for (const text of [
    observedNoDiaryCheck,
    "本周尚未进行称重或热量记录。",
    "尚未称重或记录热量。",
    "未记录饮食。",
  ])
    assert.deepEqual(measurementOnlyIssues(text), [], text);
  for (const text of [
    "未进行称重，但请记录热量",
    "未记录饮食，接下来请每天称量食物",
    "尚未记录饮食接下来请每天称量食物",
    "未称重或请记录热量",
    "未来请记录热量",
    "未來請每天稱量食物",
    "请每天称量食物。",
    "使用食物秤称重后回顾份量。",
  ])
    assert.ok(measurementOnlyIssues(text).length > 0, text);
});

test("a validated nutrition strategy can assemble all 17 actual no-diary success checks", async () => {
  const input = journeyAgentFixture(112);
  const full = alignSyntheticPractices(syntheticJourney(input));
  for (const week of full.weeks)
    week.actions[0].successCheck = observedNoDiaryCheck;
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run(_prompt, _context, tools, handle) {
      assert.equal(tools[0].name, "present_strategy");
      assert.equal(
        (await handle(tools[0].name, syntheticStrategy(full))).status,
        "ok",
      );
    },
  };
  const result = await generateJourneyContent(input, provider);
  assert.equal(result.weeks.length, 17);
  assert.ok(
    result.weeks.every(
      (week) => week.actions[0].successCheck === observedNoDiaryCheck,
    ),
  );
});
test("actual fixed-ratio and self-packed fallbacks need reported support; negation and existing ratios remain distinct", () => {
  const reported = "食堂有鸡蛋和豆腐；我不愿周末备餐。";
  assert.equal(
    journeyGroundingIssues("主食先上桌时，有意识减半主食份量。", reported)
      .length,
    1,
  );
  assert.equal(
    journeyGroundingIssues("若缺蛋白质，可自带煮鸡蛋或豆腐干补充。", reported)
      .length,
    1,
  );
  assert.deepEqual(
    journeyGroundingIssues("不要自带食物；不要求主食减半。", reported),
    [],
  );
  assert.deepEqual(
    journeyGroundingIssues("每周两次半小时步行保持不变。", reported),
    [],
  );
  assert.equal(
    journeyGroundingIssues("春节前后保持核心动作，跨越节假日聚餐。", reported)
      .length,
    1,
  );
  assert.deepEqual(
    journeyGroundingIssues(
      "为用户报告的春节聚餐准备熟悉选择。",
      reported + "我会参加春节聚餐。",
    ),
    [],
  );
  assert.equal(
    journeyGroundingIssues(
      "当食堂不可用时，改用附近便利店的即食食品。",
      reported,
    ).length,
    1,
  );
  assert.deepEqual(
    journeyGroundingIssues(
      "同楼便利店有现成米饭和豆腐时，使用已报告的组合。",
      reported + "同楼便利店有现成米饭和豆腐。",
    ),
    [],
  );
  assert.deepEqual(
    journeyGroundingIssues(
      "将一半主食换为蔬菜。",
      "我明确希望把一半主食换成蔬菜。",
    ),
    [],
  );
  assert.deepEqual(
    journeyGroundingIssues(
      "可以自带煮鸡蛋。",
      reported + "我可以自带现成煮鸡蛋。",
    ),
    [],
  );
});
test("avoids/avoiding seafood are negative advice while a separate salmon recommendation still fails", () => {
  const i = journeyAgentFixture();
  const errors = (text: string) =>
    explanationIssues(
      {
        headline: "Meal choice",
        summary: text,
        question: null,
        changes: [],
        whyForecast: "The forecast remains conditional.",
      },
      i.context,
      i.calculation.decision,
      undefined,
      [{ kind: "nutrition", title: "Lunch", details: text }],
    );
  assert.deepEqual(errors("Every food choice below avoids seafood."), []);
  assert.deepEqual(
    errors("Choose chicken and vegetables, avoiding seafood."),
    [],
  );
  assert.deepEqual(
    errors("The meal choices preserve your seafood exclusion."),
    [],
  );
  assert.ok(
    errors("Choose salmon and vegetables, avoiding seafood.").some((e) =>
      e.includes("fish"),
    ),
  );
});
test("allergen checks do not become allergen ingestion, and separate peanut butter advice still fails", () => {
  const i = journeyAgentFixture(21, "I have a peanut allergy.");
  const errors = (text: string) =>
    explanationIssues(
      {
        headline: "Meal choice",
        summary: text,
        question: null,
        changes: [],
        whyForecast: "The forecast remains conditional.",
      },
      i.context,
      i.calculation.decision,
      undefined,
      [{ kind: "nutrition", title: "Lunch", details: text }],
    );
  assert.deepEqual(
    errors("Lunch actions make peanut ingredient checks explicit."),
    [],
  );
  assert.deepEqual(errors("Confirm peanut ingredients are absent."), []);
  assert.deepEqual(errors("Use a peanut-aware lunch choice."), []);
  assert.ok(
    errors("Use a peanut-aware lunch choice with peanut butter.").some((e) =>
      e.includes("peanut"),
    ),
  );
});
