// ABOUTME: Reproduces a real Chinese post-weigh-in reflection false positive from fictional J03 output.
// ABOUTME: Food weighing and later positive diary instructions stay rejected, including temporal phrasing.
import assert from "node:assert/strict";
import test from "node:test";
import { measurementOnlyIssues } from "../src/agent/copy-policy";

test("a reflection after or alongside a body-weight check does not request a food diary", () => {
  for (const text of [
    "每周一早称重后仅回顾饮食原则与饱腹感受，不记录热量、不称食材、不备餐。",
    "每週一早稱重後只回顧飲食原則與飽足感，不記錄熱量。",
    "称重之后先复盘饮食原则与饱腹感。",
    "称重 后 只 回顾饮食原则。",
    "每周周一早上称重并回顾这一条饮食原则是否可行；根据饥饿感、适配情况和体重变化决定保持、调整或暂停",
    "每周周一早上称重并回顾这一条饮食原则是否可行，不记录每日饮食或运动；根据饥饿感、适配情况和体重变化决定保持、调整或暂停",
    "每週一早上稱重並回顧飲食原則與飽足感。",
  ])
    assert.deepEqual(measurementOnlyIssues(text), [], text);
});

test("a temporal suffix does not exempt actual food weighing", () => {
  for (const text of [
    "每周称重食物并记录热量。",
    "称量后按份量分装食物。",
    "用食物秤称重后根据食物份量配餐。",
    "将米饭称重后按份量食用。",
    "用食物秤称重后仅回顾食物份量。",
    "將食物稱重後只回顧餐食份量。",
    "使用食物秤称重并回顾份量",
    "使用食物秤稱重並回顧份量",
  ])
    assert.ok(measurementOnlyIssues(text).length, text);
});

test("post-measurement diary instructions remain a separate positive demand", () => {
  for (const text of [
    "称重后记录每餐热量。",
    "稱重後記錄每餐熱量。",
    "称重后只回顾饮食并记录每餐热量。",
    "称重后回顾饮食，不需要记录饮食，但要称量食物。",
    "称重并记录食物重量",
    "称重并回顾原则，但请每天记录热量",
    "称重并回顾饮食原则并记录每餐热量。",
    "稱重並回顧飲食原則，但請每天記錄熱量。",
    "称重并完成每日食物记录。",
  ])
    assert.ok(measurementOnlyIssues(text).length, text);
});

test("a weigh-in date is not a food-weighing request", () => {
  for (const text of [
    "Confirm weigh-in day or accepted intake assumptions.",
    "Confirm weigh‑in day or accepted intake assumptions.",
  ])
    assert.deepEqual(measurementOnlyIssues(text), [], text);
  for (const text of [
    "Confirm weigh-in day and record meals.",
    "Confirm weigh‑in day, then track calorie intake.",
    "Weigh food after the weigh-in.",
    "After the weigh-in, weigh every food portion.",
    "Weighing food portions before meals is required.",
  ])
    assert.ok(measurementOnlyIssues(text).length, text);
});
