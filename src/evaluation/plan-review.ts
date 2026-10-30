// ABOUTME: Parse bound real fictional plan receipts and render a complete, read-only calibration packet.
// ABOUTME: The receipt owns content; this derived view collects no feedback and keeps judge answers folded to reduce anchoring.
import { z } from "zod";
import { contentHash } from "../agent/stage-runtime";
import { PLAN_DIMENSIONS, PLAN_QUALITY_VERSION } from "../domain/plan-quality";
import { JourneyContentSchema, type JourneyContent } from "../domain/journey";
import { WORK_LABELS, LEISURE_LABELS } from "../planning/activity";
import { EvalIdentitySchema } from "./contracts";
import {
  planEvaluationInput,
  PlanJudgmentSchema,
  PLAN_JUDGE_VERSION,
} from "./plan-judge";

const ReviewReportSchema = z.object({
  identity: EvalIdentitySchema,
  candidateRunId: z.uuid(),
  candidateStage: z.enum(["generate", "revise"]),
  requestHash: z.string(),
  inputHash: z.string(),
  rubricVersion: z.literal(PLAN_QUALITY_VERSION),
  // Same verdict/reason contract; retain the original eight browser judgments
  // under their actual prompt version instead of relabelling or discarding them.
  judgeVersion: z.enum([
    PLAN_JUDGE_VERSION,
    "plan-judge-2026-10-30-coherence-v8",
  ]),
  judgeConfigurationHash: z.string(),
  evaluationStatus: z.enum(["completed", "incomplete"]),
  planVerdict: z.enum(["pass", "fail"]).nullable(),
  calibrationStatus: z.literal("not_calibrated"),
  dimensions: z
    .array(
      z.object({
        dimensionId: z.enum(PLAN_DIMENSIONS.map((d) => d.id)),
        status: z.enum(["completed", "incomplete", "failed"]),
        judgment: PlanJudgmentSchema.nullable(),
        incompleteReason: z.string().nullable(),
        error: z.string().nullable(),
        traceExport: z.object({
          status: z.enum(["disabled", "submitted", "failed", "unconfirmed"]),
          runId: z.uuid().nullable(),
        }),
      }),
    )
    .length(4),
});

/** Reject stale/misbound judgments rather than presenting them beside a different plan. */
export function planReviewPacket(
  receipts: unknown[],
  judgmentReports: unknown[],
) {
  if (!receipts.length || receipts.length > 8)
    throw Error("Select one to eight complete fictional plans.");
  const inputs = receipts.map((r) =>
    planEvaluationInput(r, "human-calibration"),
  );
  const reports = judgmentReports.map((r) => ReviewReportSchema.parse(r));
  if (
    new Set(inputs.map((i) => i.candidateRunId)).size !== inputs.length ||
    new Set(reports.map((r) => r.candidateRunId)).size !== reports.length
  )
    throw Error("Select each plan and its judge report only once.");
  for (const r of reports) {
    const input = inputs.find((i) => i.candidateRunId === r.candidateRunId);
    if (
      !input ||
      input.inputHash !== r.inputHash ||
      input.requestHash !== r.requestHash ||
      input.candidateStage !== r.candidateStage ||
      input.identity.caseId !== r.identity.caseId ||
      input.identity.datasetVersion !== r.identity.datasetVersion
    )
      throw Error(
        "A judge report does not match this exact plan and input context.",
      );
    if (
      new Set(r.dimensions.map((d) => d.dimensionId)).size !==
      PLAN_DIMENSIONS.length
    )
      throw Error(
        "A report must contain each independent dimension exactly once.",
      );
    for (const d of r.dimensions) {
      if (
        d.status === "completed"
          ? !d.judgment || d.error !== null || d.incompleteReason !== null
          : d.judgment !== null
      )
        throw Error(
          "Assessment execution and the quality verdict contradict one another.",
        );
    }
    const complete = r.dimensions.every((d) => d.status === "completed");
    const verdict = complete
      ? r.dimensions.some((d) => d.judgment?.verdict === "fail")
        ? "fail"
        : "pass"
      : null;
    if (
      r.evaluationStatus !== (complete ? "completed" : "incomplete") ||
      r.planVerdict !== verdict
    )
      throw Error(
        "An incomplete evaluation cannot carry an overall plan verdict.",
      );
  }
  return {
    version: "plan-review-2026-10-29-v1",
    rubricVersion: PLAN_QUALITY_VERSION,
    calibrationStatus: "awaiting_human_review",
    items: inputs.map((input) => ({
      ...input,
      previousCandidateRunId:
        input.candidateStage === "revise"
          ? (inputs.find(
              (prior) =>
                contentHash(prior.caseData.candidate) ===
                contentHash(input.caseData.priorPlan),
            )?.candidateRunId ?? null)
          : null,
      judge:
        reports.find((r) => r.candidateRunId === input.candidateRunId) ?? null,
    })),
  };
}
export type PlanReviewPacket = ReturnType<typeof planReviewPacket>;
type ReviewItem = PlanReviewPacket["items"][number];
const esc = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const p = (text: unknown) => `<p>${esc(text)}</p>`;
const list = (items: readonly string[]) =>
  `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
const facts = (rows: [string, unknown][]) =>
  `<dl>${rows.map(([name, value]) => `<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>`;

function planContent(plan: JourneyContent, id: string) {
  return `<h3>${esc(plan.headline)}</h3>${p(plan.summary)}
    <h4>整体复盘方式</h4>${p(plan.reviewApproach)}
    <details><summary>方案采用了哪些个人依据</summary>${plan.whyForYou.map((r) => `${p(r.reason)}<blockquote>${esc(r.quote)}</blockquote>`).join("")}</details>
    <h4>完整阶段安排</h4>${plan.phases
      .map((phase, i) => {
        const g = phase.guidance;
        return `<section id="${id}-phase-${i + 1}" class="phase"><h5>${esc(phase.label)}</h5><p class="muted">${phase.startsOn} — ${phase.endsOn}</p>${p(phase.focus)}${
          g
            ? `<h6>阶段目标</h6>${p(g.objective)}<h6>执行重点</h6>${list(g.commitments)}${g.obstacles.length ? `<h6>障碍与替代</h6><ul>${g.obstacles.map((o) => `<li>${esc(o.barrier)}<br><strong>替代：</strong>${esc(o.alternative)}</li>`).join("")}</ul>` : ""}<h6>检查时要讨论的事</h6>${list(g.checkInQuestions)}<h6>何时保持，何时讨论调整</h6>${facts(
                [
                  ["保持", g.progression.keepWhen],
                  ["讨论调整", g.progression.discussChangeWhen],
                ],
              )}<details><summary>阶段依据</summary>${g.evidence.map((e) => `${p(e.reason)}<blockquote>${esc(e.quote)}</blockquote>`).join("")}</details>`
            : p("这份历史方案没有结构化阶段详情；保留原文。")
        }</section>`;
      })
      .join("")}
    <details class="weeks"><summary>完整周级建议与测量检查点（${plan.weeks.length} 个日历周）</summary>${plan.weeks.map((w, i) => `<section id="${id}-week-${i + 1}" class="week"><h5>第 ${i + 1} / ${plan.weeks.length} 周 · ${w.weekStart}${i === plan.weeks.length - 1 ? " · 最后一周" : ""}</h5>${p(w.focus)}<p><strong>测量检查点：</strong>${w.checkIn.date} · ${esc(w.checkIn.label)}</p>${w.actions.map((a) => `<article><h6>${esc(a.title)}</h6>${p(a.details)}${facts([["类别", a.kind === "nutrition" ? "饮食选择" : "活动建议"], ["适用日期", a.dates.join(", ")], ...(a.plannedMinutes === null ? [] : [["每次活动时长", `${a.plannedMinutes} min`] as [string, string]]), ["替代办法", a.fallback], ["观察什么", a.successCheck]])}</article>`).join("")}</section>`).join("")}</details>`;
}

function feedbackContent(item: ReviewItem) {
  const feedback = item.caseData.feedback;
  return feedback
    ? `<section class="feedback"><h4>用户对原方案的明确反馈</h4>${p(feedback.notes)}${facts(
        [
          [
            "结构化反馈",
            feedback.priorities
              .map((priority) => priority.replaceAll("_", " "))
              .join(" · "),
          ],
          [
            "愿意投入的新上限",
            feedback.availableTrainingMinutes === null
              ? "没有更改"
              : `${feedback.availableTrainingMinutes} min / week`,
          ],
          ["期望日期更改", feedback.requestedGoalDate ?? "没有更改"],
        ],
      )}</section>`
    : "";
}

function suppliedPriorPlan(item: ReviewItem) {
  if (item.candidateStage !== "revise" || item.previousCandidateRunId)
    return "";
  const prior = JourneyContentSchema.safeParse(item.caseData.priorPlan);
  return prior.success
    ? `<details><summary>查看修订前的完整方案</summary>${planContent(prior.data, `prior-${item.candidateRunId}`)}</details>`
    : p(
        "这条记录没有完整原方案，无法完整判断修订是否落实反馈；请补充原方案上下文。",
      );
}

function context(item: ReviewItem) {
  const c = item.caseData,
    b = c.profile,
    calc = c.calculator;
  const target = `${c.goal.value} ${c.goal.kind === "weight" ? "kg" : "% body fat"}`;
  const conclusion =
    c.feasibility.goalReachedAtHorizon === null
      ? "无法判断：缺少该期限的可用 Hall 结果"
      : c.feasibility.goalReachedAtHorizon
        ? "在现有目标判定容差内，条件预测可达到目标"
        : "按当前假设，条件预测未在期限内达到目标";
  return `<details class="context"><summary>查看完整用户条件与计算依据</summary>${facts(
    [
      [
        "身体基线",
        `${b.sex === "male" ? "男" : "女"} · ${b.ageYears} 岁 · ${b.heightCm} cm · ${b.weightKg} kg`,
      ],
      ["基线日期", b.startDate],
      [
        "初始实测体脂",
        b.bodyFat
          ? `${b.bodyFat.percent}% / ${b.bodyFat.method}`
          : "未提供实测值",
      ],
      ["目标", target],
      ["用户期望日期", c.goal.requestedDate ?? "未指定"],
      ["本方案计算期限", `${c.asOfDate} — ${calc.targetDate ?? "不可用"}`],
      [
        "当前实际活动",
        `${WORK_LABELS[b.activity.work]} / ${LEISURE_LABELS[b.activity.leisure]}`,
      ],
      [
        "未来愿意投入上限",
        `${c.preferences.availableTrainingMinutes} min / week`,
      ],
      ["Hall 条件达标结论", conclusion],
    ],
  )}<h4>生活条件</h4>${p(c.preferences.context)}<h4>饮食与可获取资源</h4>${p(c.preferences.foodPreferences)}${p(`做饭条件：${c.preferences.cooking}`)}
    <h4>计算器给出的执行目标</h4>${
      calc.baseline
        ? facts([
            ["初始估计总消耗", `${calc.baseline.tdeeKcal.toFixed(2)} kcal/day`],
            ["初始活动系数", calc.baseline.pal],
            [
              "模型初始体脂",
              `${calc.baseline.bodyFatPct.toFixed(2)}% · ${calc.baseline.bodyFatSource}`,
            ],
          ])
        : p("初始消耗估计不可用")
    }${calc.proposedTargets.length ? facts(calc.proposedTargets.map((t) => [`从 ${t.effectiveFrom}`, `${t.dailyCalories} kcal/day · ${t.mode} · 目标日期 ${t.targetDate}`])) : p("没有可用目标")}
    <details><summary>条件预测数值（不是已实现结果）</summary>${facts(calc.models.map((m) => [m.id === "hall" ? "Hall / NIDDK" : m.id === "thomas" ? "Thomas / Pennington" : "Modified Antonetti", m.status === "ok" && m.endpoint ? `${m.endpoint.date} · ${m.endpoint.weightKg.toFixed(2)} kg${m.endpoint.bodyFatPct === null ? "" : ` · ${m.endpoint.bodyFatPct.toFixed(2)}% body fat`}` : "结果不可用"]))}${p(calc.decision.summary)}${list(calc.assumptions)}</details>
    ${feedbackContent(item)}
    ${c.revisionIntent ? `<section class="feedback"><h4>已记录的方案调整意图</h4>${facts(Object.entries(c.revisionIntent).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]))}</section>` : ""}
    ${c.latestReview ? `<h4>这次修订前的教练结论</h4>${p(c.latestReview.recommendation)}${p(c.latestReview.summary)}${p(c.latestReview.uncertainty)}` : ""}
    ${
      c.measurements.length
        ? `<h4>评审当时已知的测量与备注</h4>${c.measurements
            .map(
              (m) =>
                `${facts([
                  ["日期", m.date],
                  ["体重", m.weightKg === null ? "未测" : `${m.weightKg} kg`],
                  [
                    "体脂",
                    m.bodyFat
                      ? `${m.bodyFat.percent}% / ${m.bodyFat.method}`
                      : "未测",
                  ],
                ])}${p(m.notes)}`,
            )
            .join("")}`
        : p("生成时尚无后续测量记录。")
    }</details>`;
}

function judgments(item: ReviewItem) {
  return `<details class="judgments"><summary>查看四维判定与理由（尚未人工校准）</summary>${
    !item.judge
      ? p("尚未执行当前契约的评审。")
      : PLAN_DIMENSIONS.map((d) => {
          const j = item.judge!.dimensions.find((x) => x.dimensionId === d.id)!;
          return `<section id="plan-${item.candidateRunId}-judge-${d.id}"><h4>${esc(d.titleZh)}</h4><p class="verdict">${j.status === "completed" ? j.judgment!.verdict.toUpperCase() : j.status === "incomplete" ? "评估未完成：上下文不足" : "评估执行失败"}</p>${p(j.judgment?.reason ?? j.incompleteReason ?? j.error)}<details><summary>追踪定位</summary>${facts(
            [
              ["Judge run", j.traceExport.runId ?? "不可用"],
              ["追踪导出", j.traceExport.status],
            ],
          )}</details></section>`;
        }).join("")
  }</details>`;
}

/** Source content is escaped and never truncated; native browser annotations are the only feedback surface. */
export function renderPlanReview(packet: PlanReviewPacket) {
  const paired = new Set(
    packet.items
      .filter((i) => i.previousCandidateRunId)
      .map((i) => i.candidateRunId),
  );
  const groups = packet.items.filter((i) => !paired.has(i.candidateRunId));
  const contextSignature = (item: ReviewItem) =>
    contentHash({
      profile: item.caseData.profile,
      goal: item.caseData.goal,
      preferences: item.caseData.preferences,
      asOfDate: item.caseData.asOfDate,
      targets: item.caseData.calculator.proposedTargets,
      models: item.caseData.calculator.models,
      measurements: item.caseData.measurements,
      revisionIntent: item.caseData.revisionIntent,
      latestReview: item.caseData.latestReview,
    });
  const card = (item: ReviewItem, shared: ReviewItem) =>
    `<article class="plan" id="plan-${item.candidateRunId}"><h2>${item.candidateStage === "generate" ? "完整初始方案" : "完整修订方案"}</h2>${item.candidateRunId === shared.candidateRunId ? "" : contextSignature(item) === contextSignature(shared) ? feedbackContent(item) : context(item)}${suppliedPriorPlan(item)}<section class="output">${planContent(item.caseData.candidate, `plan-${item.candidateRunId}`)}</section>${judgments(item)}<details class="provenance"><summary>原始运行定位</summary>${facts(
      [
        ["候选 run", item.candidateRunId],
        ["来源提交", item.sourceCommit],
        ["输入绑定", item.inputHash],
        ["评审契约", item.judge?.judgeVersion ?? "未执行"],
      ],
    )}</details></article>`;
  const content = groups
    .map((initial, index) => {
      const revisions = packet.items.filter(
        (i) => i.previousCandidateRunId === initial.candidateRunId,
      );
      const c = initial.caseData;
      return `<section id="review-${index + 1}" class="case"><h2>案例 ${index + 1} · ${revisions.length ? "初始方案与反馈后的修订" : initial.candidateStage === "revise" ? "完整修订方案（保留原始前案）" : "完整初始方案"}</h2>${facts(
        [
          [
            "基线",
            `${c.profile.sex === "male" ? "男" : "女"} · ${c.profile.ageYears} 岁 · ${c.profile.heightCm} cm · ${c.profile.weightKg} kg`,
          ],
          [
            "目标与周期",
            `${c.goal.value} ${c.goal.kind === "weight" ? "kg" : "% body fat"} · ${c.asOfDate} — ${c.calculator.targetDate}`,
          ],
          [
            "愿意投入上限",
            `${c.preferences.availableTrainingMinutes} min / week`,
          ],
        ],
      )}${context(initial)}<div class="${revisions.length ? "comparison" : "single"}">${[initial, ...revisions].map((item) => card(item, initial)).join("")}</div></section>`;
    })
    .join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Adaptive · 完整方案与 Judge 校准</title><style>
  *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#fafaf9;color:#202020;font:15px/1.65 system-ui,-apple-system,sans-serif}main{max-width:1200px;margin:auto;padding:28px 28px 80px}h1{font-size:30px;line-height:1.3;margin:0 0 12px}h2{font-size:23px;line-height:1.4}h3{font-size:21px;line-height:1.4}h4{font-size:16px;margin:22px 0 8px}h5{font-size:16px;margin:0}h6{font-size:14px;margin:16px 0 5px}p{margin:6px 0 14px;overflow-wrap:anywhere}a{color:#9c3514;text-underline-offset:3px}.intro{max-width:840px}.muted,.provenance{color:#66635f;font-size:13px}nav{position:sticky;top:0;background:#fafaf9;border-bottom:1px solid #e4e4e0;padding:12px 0;display:flex;gap:20px;z-index:2}.criteria{padding:18px 0}.criteria li{margin-bottom:12px}.case{padding:25px 0;scroll-margin-top:65px}.comparison{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;align-items:start}.single{max-width:850px}.plan{min-width:0;background:#fff;border:1px solid #e4e4e0;border-radius:10px;padding:22px}.plan>h2{margin-top:0}summary{cursor:pointer;font-weight:600;line-height:1.5;padding:10px 0}details{margin:12px 0}details[open]>summary{margin-bottom:8px}.phase,.week,.feedback,.judgments section{border-top:1px solid #e4e4e0;margin-top:20px;padding-top:18px}.phase h5{font-size:18px}.context,.judgments{background:#f5f5f2;padding:4px 14px;border-radius:8px}dl{margin:12px 0}dl>div{display:grid;grid-template-columns:minmax(90px,0.8fr) minmax(0,2fr);gap:14px;padding:6px 0;border-bottom:1px solid #eeeee9}dt{color:#66635f}dd{margin:0;overflow-wrap:anywhere}blockquote{margin:10px 0;padding:10px 14px;background:#f5f5f2;border-radius:6px;font-size:13px;overflow-wrap:anywhere}ul{padding-left:22px}li{margin:6px 0}.verdict{font-weight:600}.output{padding:8px 0}.provenance{font-size:12px}.provenance dd{font-family:ui-monospace,monospace}@media(max-width:700px){.comparison{grid-template-columns:1fr}main{padding:22px 16px}.plan{padding:18px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
  </style></head><body><main><header class="intro"><p class="muted">Adaptive · 人工校准</p><h1>完整方案、用户反馈与评审理由</h1><p>${packet.items.length} 份真实模型生成的方案，资料全部虚构。先判断方案是否帮助这个人，再展开 judge 的判定与理由。修订方案需要结合原方案和明确反馈阅读。</p><p>使用浏览器批注或在当前聊天反馈。未批注表示尚未评审，不表示通过。可指出具体不合理之处、误判或缺少的上下文；不需要把产品判断当作临床认证。</p></header><nav><a href="#criteria">四维问题</a>${groups.map((_, i) => `<a href="#review-${i + 1}">案例 ${i + 1}</a>`).join("")}</nav><details id="criteria" class="criteria"><summary>查看四个独立的评审问题</summary><ol>${PLAN_DIMENSIONS.map((d) => `<li id="criterion-${d.id}"><strong>${esc(d.titleZh)}</strong><br>${esc(d.questionZh)}</li>`).join("")}</ol><p class="muted">上下文足够时使用 pass/fail 与理由；缺少评审所需上下文则标为未完成。方案在充分上下文下确实遗漏必要内容，仍可判 fail。两者不能混为一谈。</p></details>${content}</main></body></html>`;
}
