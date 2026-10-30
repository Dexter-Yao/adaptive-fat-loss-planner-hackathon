// ABOUTME: User-language copy keeps canonical facts, goal acknowledgments and safety controls intact.
// ABOUTME: Synthetic providers verify contracts; actual multilingual quality requires a real model walkthrough.
import assert from "node:assert/strict";
import test from "node:test";
import {
  responseLanguageContext,
  RESPONSE_LANGUAGE_INSTRUCTIONS,
} from "../src/agent/response-language";
import { generateJourneyContent } from "../src/agent/journey-content";
import { reviewInitialization } from "../src/agent/initialize";
import { generationInput } from "../src/agent/stage-router";
import { numericalProseIssues } from "../src/domain/numeric-copy";
import { practicalAdviceIssues } from "../src/agent/copy-policy";
import { phaseGuidancePolicyIssues } from "../src/agent/phase-guidance";
import {
  journeyStageFixture,
  syntheticJourney,
  syntheticGuidanceContent,
} from "./support/journey-agent";
import type { AgentProvider } from "../src/agent/session";
import { receiveDraft } from "../src/application/journey-commands";
import { selectPlanReview } from "../src/application/journey-experience-view";
import { UNMET_GOAL_NOTICE } from "../src/planning/journey-feasibility";

test("language evidence is user text, independent from the English interface and schema", () => {
  const preferences = {
    context: "我经常外食，不希望记录饮食。",
    foodPreferences: "普通家庭餐。",
  };
  const context = responseLanguageContext(
    preferences,
    ["Prefiero principios flexibles."],
    "原方案。",
  );
  assert.equal(context.recentUserText[0], "Prefiero principios flexibles.");
  assert.equal(context.onboardingText[0], preferences.context);
  assert.equal(context.previousContentSample, "原方案。");
  assert.match(RESPONSE_LANGUAGE_INSTRUCTIONS, /interface is English/);
  assert.match(
    RESPONSE_LANGUAGE_INSTRUCTIONS,
    /user-facing generated content follows the user's language/,
  );
});

test("initial interpretation can explain in Chinese while preserving categorical values and exact evidence", async () => {
  const f = journeyStageFixture();
  f.input.preferences.context = "我目前久坐工作，平时在外面吃饭。";
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run(_p, context, tools, handle) {
      const c = JSON.parse(context);
      assert.ok(
        c.responseLanguage.onboardingText.includes(f.input.preferences.context),
      );
      const e = c.evidenceOptions.find(
        (e: { sourceId: string }) => e.sourceId === "context",
      );
      const clarification = {
        work: f.input.profile.activity.work,
        leisure: f.input.profile.activity.leisure,
        rationale: [
          {
            evidenceId: e.evidenceId,
            explanation: "工作与休闲活动分别保留，未来愿望不计入当前活动。",
          },
        ],
      };
      for (const punctuation of ["?", "？"]) {
        const rejected = await handle(tools[0].name, {
          ...clarification,
          questions: [punctuation],
        });
        assert.notEqual(rejected.status, "ok");
      }
      const result = await handle(tools[0].name, {
        ...clarification,
        questions: [],
      });
      assert.equal(result.status, "ok");
    },
  };
  const result = await reviewInitialization(f.input, provider);
  assert.equal(
    result.interpretation?.rationale[0].quote,
    f.input.preferences.context,
  );
  assert.match(result.interpretation!.rationale[0].explanation, /工作/);
});

test("a non-English plan acknowledges the exact computed outcome without an English prose prefix or a stored model flag", async () => {
  const f = journeyStageFixture(7, undefined, 72);
  const input = generationInput(f.request);
  input.recentUserText = ["请用中文解释，我不想每天记录饮食。"];
  const content = syntheticJourney(input);
  content.headline = "适合日常生活的减脂方案";
  content.summary =
    "按当前假设，预计无法在目标日期前达标。先保留熟悉的正餐，选择可获得的蔬菜与蛋白质，并在复盘时讨论执行感受。";
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run(_p, raw, tools, handle) {
      const c = JSON.parse(raw);
      assert.equal(c.feasibility.goalReachedAtHorizon, false);
      assert.equal(
        c.responseLanguage.recentUserText[0],
        input.recentUserText![0],
      );
      const wrong = {
        ...syntheticGuidanceContent(content),
        goalStatus: "projected_reached",
      };
      assert.notEqual((await handle(tools[0].name, wrong)).status, "ok");
      assert.equal(
        (
          await handle(tools[0].name, {
            ...wrong,
            goalStatus: "projected_unmet",
          })
        ).status,
        "ok",
      );
    },
  };
  const result = await generateJourneyContent(input, provider);
  assert.equal(result.summary, content.summary);
  assert.equal("goalStatus" in result, false);
  assert.equal(result.whyForYou[0].quote, content.whyForYou[0].quote);
  const saved = receiveDraft(f.session, result, f.request.binding);
  const review = selectPlanReview(saved, f.request.binding.asOfDate);
  assert.equal(review?.feasibility?.requiredNotice, UNMET_GOAL_NOTICE);
  assert.equal(review?.feasibility?.goalReachedAtHorizon, false);
});

test("Chinese copy retains diary, hunger and numerical-ownership boundaries with local negation", () => {
  assert.deepEqual(
    practicalAdviceIssues(
      "用户明确不想记录饮食、计算热量、额外备餐，只维持现有散步习惯，方案必须零记录、零额外烹饪、不增加运动",
    ),
    [],
  );
  assert.ok(practicalAdviceIssues("零负担，请记录饮食。").length);
  assert.ok(practicalAdviceIssues("请记录每餐饮食和运动。").length);
  assert.deepEqual(
    practicalAdviceIssues("无需记录饮食，只需更新体重和备注。"),
    [],
  );
  assert.deepEqual(practicalAdviceIssues("记录体重，不需要记录饮食。"), []);
  assert.deepEqual(
    practicalAdviceIssues("不记录饮食，不计算热量，只更新测量。"),
    [],
  );
  assert.ok(practicalAdviceIssues("不记录饮食，但请记录运动。").length);
  assert.deepEqual(
    practicalAdviceIssues("只记录体重，饮食方案保留家庭餐。"),
    [],
  );
  assert.deepEqual(practicalAdviceIssues("不要求记录饮食，保留家庭晚餐。"), []);
  assert.ok(practicalAdviceIssues("记录体重和饮食。").length);
  assert.ok(practicalAdviceIssues("不想增加负担，请记录饮食。").length);
  assert.ok(practicalAdviceIssues("不用记录食物，但请记录运动。").length);
  assert.ok(practicalAdviceIssues("如果持续饥饿，就继续减少主食份量。").length);
  assert.deepEqual(
    practicalAdviceIssues("别在持续饥饿时进一步减少主食，应复核饱腹感。"),
    [],
  );
  assert.ok(
    practicalAdviceIssues("不要跳过蔬菜，持续饥饿时继续减少主食。").length,
  );
  assert.deepEqual(
    practicalAdviceIssues("如果持续饥饿，不要继续减少主食，应复核方案。"),
    [],
  );
  for (const text of [
    "每天吃1500卡路里。",
    "摄入一千五百大卡。",
    "目标减10斤。",
    "体脂率达到25％。",
  ])
    assert.ok(numericalProseIssues(text).length, text);
  const content = syntheticJourney(
    generationInput(journeyStageFixture().request),
  );
  content.phases[0].guidance!.commitments = ["每天散步30分钟。"];
  assert.ok(phaseGuidancePolicyIssues(content, 60).length);
});
