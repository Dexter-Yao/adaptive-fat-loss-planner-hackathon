// ABOUTME: Offline preparation/review, receipt comparison and judge-calibration diagnostics for Adaptive.
// ABOUTME: No inference, network, feedback writes, approval flags or application-state mutations exist here.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { reviewSuite } from "../src/evaluation/review-suite";
import { compareReceipts } from "../src/evaluation/comparison";
import { judgeCalibration } from "../src/evaluation/judge-calibration";
import {
  planReviewPacket,
  renderPlanReview,
} from "../src/evaluation/plan-review";
import { LEISURE_LABELS, WORK_LABELS } from "../src/planning/activity";
const arg = (k: string, fallback = "") =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ??
  fallback;
const esc = (v: unknown) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const para = (s: string) => `<p>${esc(s)}</p>`;
async function save(path: string, value: string) {
  if (!path.startsWith(".runtime/") || path.split("/").includes(".."))
    throw Error("Keep derived review/report artifacts under ignored .runtime.");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, { mode: 0o600 });
}
function reader() {
  const s = reviewSuite;
  const cases = s.cases
    .map((c) => {
      const { profile: p, goal: g, preferences: f } = c.initialInput;
      const target =
        g.kind === "weight"
          ? `${p.weightKg.toFixed(1)} → ${g.value.toFixed(1)} kg`
          : `${p.bodyFat?.percent.toFixed(1) ?? "未知"} → ${g.value.toFixed(1)}% 体脂`;
      return `<section id="${c.id}" data-case-id="${c.id}"><p class="eyebrow">${c.id}</p><h2>${esc(c.titleZh)}</h2><div class="facts"><div><small>虚构身体基线 · ${p.startDate}</small><strong>${p.sex === "male" ? "男" : "女"} · ${p.ageYears} 岁 · ${p.heightCm} cm · ${p.weightKg.toFixed(1)} kg</strong></div><div><small>用户目标</small><strong>${esc(target)}</strong><span>${g.requestedDate ? `期望日期 ${g.requestedDate}` : "未指定硬截止"}</span></div></div>${para(c.cycleZh)}<h3>生活条件与愿意投入</h3>${para(c.lifeZh)}${para(c.effortZh)}<h3>第一次方案审阅时的反馈</h3>${para(c.feedbackZh)}<h3>后续连续 check-in</h3><div class="table-scroll"><table><thead><tr><th>日期</th><th>体重</th><th>体脂／方法</th><th>情境与用户意图</th></tr></thead><tbody>${c.checkIns.map((e, i) => `<tr id="${c.id}-check-${i + 1}"><td>${e.measurement.date}</td><td>${e.measurement.weightKg === null ? "未测" : e.measurement.weightKg.toFixed(1) + " kg"}</td><td>${e.measurement.bodyFat ? `${e.measurement.bodyFat.percent.toFixed(1)}% / ${e.measurement.bodyFat.method.toUpperCase()}` : "未测"}</td><td>${esc(e.detailZh)}</td></tr>`).join("")}</tbody></table></div><h3>这个案例要检验什么</h3>${para(c.focusZh)}<ul>${c.criteria
        .map((id) => s.rubric.find((r) => r.id === id)!)
        .map((r) => `<li>${esc(r.questionZh)}</li>`)
        .join(
          "",
        )}</ul><details><summary>查看实际英文输入与来源启发</summary><p>${c.sourceIds.map((id) => `<a href="${esc(s.sources[id])}">${id} 原讨论</a>`).join(" · ")}</p><p>来源只启发需求；本案例全部资料、目标、日期、读数和反馈均为虚构。S02 / S07 / S08 的直开验证仍受限。</p><p>当前活动：${esc(WORK_LABELS[p.activity.work])} / ${esc(LEISURE_LABELS[p.activity.leisure])}；未来正式活动上限 ${f.availableTrainingMinutes} 分钟/周。</p>${para(f.context)}${para(f.foodPreferences)}<h4>方案反馈</h4>${para(c.initialFeedback.notes)}${c.checkIns.map((e) => `<h4>${e.measurement.date}</h4>${para(e.measurement.notes)}${e.feedback ? para(e.feedback.notes) : ""}`).join("")}</details></section>`;
    })
    .join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Adaptive · 六个旅程案例与评判标准</title><style>*{box-sizing:border-box}body{margin:0;background:#fafaf9;color:#202020;font:16px/1.65 system-ui,-apple-system,sans-serif}main{max-width:1000px;margin:auto;padding:32px 26px 80px}h1{font-size:30px;line-height:1.3}h2{font-size:25px;line-height:1.35}h3{font-size:17px;margin:25px 0 8px}h4{font-size:15px}p{margin:8px 0 16px}.notice{background:#fff0e8;padding:16px 20px;border-radius:10px}nav{position:sticky;top:0;padding:10px 0;background:#fafaf9;border-bottom:1px solid #e4e4e0;display:flex;gap:16px;flex-wrap:wrap;z-index:1}a{color:#9c3514;text-underline-offset:3px}section{padding:30px 0;scroll-margin-top:60px;border-bottom:1px solid #e4e4e0}.eyebrow,small,details{color:#66635f}small{display:block;font-size:13px}.eyebrow{margin-bottom:4px}.facts{display:flex;gap:36px;flex-wrap:wrap;margin:18px 0}.facts strong{display:block;font-size:19px}.facts span{font-size:14px}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:10px 12px;text-align:left;vertical-align:top;border-bottom:1px solid #e4e4e0}th{background:#f0f0ed;font-weight:600}td:nth-child(-n+3){white-space:nowrap}li{margin:10px 0}details{margin-top:22px;font-size:14px}summary{cursor:pointer}details h4{margin-bottom:5px}.criteria{display:grid;gap:16px}.criterion{padding:16px 20px;border:1px solid #e4e4e0;border-radius:8px;background:#fff}.criterion h3{margin:0 0 8px}.criterion p:last-child{margin-bottom:0}.muted{font-size:14px;color:#66635f}</style></head><body><main><p class="eyebrow">Adaptive · 案例已确认，四维评审待校准</p><h1>六个完整旅程，检验规划与动态支持</h1><div class="notice">${para(s.provenanceZh)}${para(s.scopeZh)}</div><p>${esc(s.timeZh)}</p><p>六个案例已获 Dexter 确认。完整初始/修订方案共用四维二分评审；你可以继续批注案例与标准，或审查真实评审的理由。</p><nav><a href="#criteria">评判标准</a>${s.cases.map((c) => `<a href="#${c.id}">${c.id} ${esc(c.titleZh.slice(0, 4))}</a>`).join("")}</nav><section id="criteria"><h2>评判标准提案</h2><p>对同一份完整初始/修订方案并行进行四维 Nemotron 3 Ultra 评审，每维只输出 Pass 或 Fail 和理由。缺少评审上下文则标为评估未完成；方案在充分上下文下缺少必要内容才可判 Fail。没有预写标准答案。</p><div class="criteria">${s.rubric.map((r) => `<article class="criterion" id="criterion-${r.id}"><h3>${esc(r.titleZh)}</h3>${para(r.questionZh)}<p class="muted">明确失败：${esc(r.failureZh)}</p></article>`).join("")}</div><h3>自动检查与人工判断各负责什么</h3><p>代码核对契约、数值来源、版本、接受状态与失败恢复。人工判断方案是否有用、适度、尊重投入。科学依据和预测局限单独复核；虚构体重变化不证明预测准确或减脂有效。</p><h3>模型比较与 judge 校准</h3><p>相同案例与时间前缀用于对比各阶段；记录完整配置、实际返回模型、首轮/修复、延迟和用量。更换上下文/工具时，明确比较的是完整系统配置。LLM judge 先与真实人工标签对照，审查误判与不确定项，未经批准不代替人工。</p></section>${cases}</main></body></html>`;
}
function markdownReader() {
  const s = reviewSuite;
  const lines = [
    "# Adaptive：六个旅程案例与评判标准",
    "",
    "六个案例已确认；评审器未校准 · " + s.version,
    "",
    s.provenanceZh,
    "",
    s.scopeZh,
    "",
    s.timeZh,
    "",
    "## 评判标准提案",
    "",
    "完整初始/修订方案共用四维评审，每维使用 Pass / Fail 和理由；评审上下文不足时标为未完成，不计为方案 Fail。",
    "",
  ];
  for (const r of s.rubric)
    lines.push(
      "### " + r.titleZh,
      "",
      r.questionZh,
      "",
      "明确失败：" + r.failureZh,
      "",
    );
  lines.push(
    "自动检查负责数值来源、版本、约束、接受状态和失败恢复；人工判断实际帮助与适度性。Nemotron 3 Ultra 评审独立并行运行；未经校准不等于专家判断。虚构读数不证明预测准确或临床效果。",
    "",
  );
  for (const c of s.cases) {
    const { profile: p, goal: g, preferences: f } = c.initialInput;
    const target =
      g.kind === "weight"
        ? `${p.weightKg.toFixed(1)} → ${g.value.toFixed(1)} kg`
        : `${p.bodyFat?.percent.toFixed(1)} → ${g.value.toFixed(1)}% 体脂`;
    lines.push(
      `## ${c.id}：${c.titleZh}`,
      "",
      `虚构基线：${p.startDate}；${p.sex === "male" ? "男" : "女"}，${p.ageYears} 岁，${p.heightCm} cm，${p.weightKg.toFixed(1)} kg。`,
      "",
      `目标：${target}；${g.requestedDate ? "期望日期 " + g.requestedDate : "没有硬截止"}。`,
      "",
      c.cycleZh,
      "",
      "生活条件：" + c.lifeZh,
      "",
      "愿意投入：" + c.effortZh,
      "",
      "第一次方案反馈：" + c.feedbackZh,
      "",
      "| 日期 | 体重 | 体脂／方法 | 情境与意图 |",
      "| --- | --- | --- | --- |",
    );
    for (const e of c.checkIns)
      lines.push(
        `| ${e.measurement.date} | ${e.measurement.weightKg === null ? "未测" : e.measurement.weightKg.toFixed(1) + " kg"} | ${e.measurement.bodyFat ? e.measurement.bodyFat.percent.toFixed(1) + "% / " + e.measurement.bodyFat.method.toUpperCase() : "未测"} | ${e.detailZh} |`,
      );
    lines.push(
      "",
      "检验重点：" + c.focusZh,
      "",
      "来源启发：" +
        c.sourceIds.map((id) => `[${id}](${s.sources[id]})`).join("、") +
        "。S02/S07/S08 的直开复核受限。",
      "",
      `未来正式活动上限：${f.availableTrainingMinutes} 分钟/周；该上限不能自动当作实际运动或必须完成的配额。`,
      "",
    );
  }
  lines.push(
    "## 这次要确认",
    "",
    ...s.commonReviewQuestionsZh.map((x) => "- " + x),
    "",
    "六个案例已确认。后续请审查真实方案及评审理由；没有人工标签的维度保持未校准，不要求 Dexter 扮演临床专家。",
    "",
  );
  return lines.join("\n");
}
async function main() {
  const mode = arg("mode", "review");
  if (mode === "plans") {
    const paths = arg("receipts").split(",").filter(Boolean);
    const judgments = arg("judgments").split(",").filter(Boolean);
    const read = async (p: string) => JSON.parse(await readFile(p, "utf8"));
    const packet = planReviewPacket(
      await Promise.all(paths.map(read)),
      await Promise.all(judgments.map(read)),
    );
    const out = arg(
      "out",
      ".runtime/agent-quality/plan-calibration/review.html",
    );
    if (!out.endsWith(".html")) throw Error("Use an HTML output path.");
    await save(out, renderPlanReview(packet));
    await save(out.slice(0, -5) + ".json", JSON.stringify(packet, null, 2));
    console.log(
      JSON.stringify({
        out,
        plans: packet.items.length,
        calibrationStatus: packet.calibrationStatus,
        modelCalls: 0,
      }),
    );
    return;
  }
  if (mode === "review") {
    const out = arg("out", ".runtime/agent-quality/six-journeys-review.html");
    await save(out, reader());
    await save(out.replace(/\.html$/, "") + ".md", markdownReader());
    console.log(
      JSON.stringify({
        out,
        version: reviewSuite.version,
        status: reviewSuite.status,
        cases: reviewSuite.cases.length,
        checkIns: reviewSuite.cases.reduce((n, c) => n + c.checkIns.length, 0),
        modelCalls: 0,
      }),
    );
    return;
  }
  if (mode === "compare") {
    const paths = arg("receipts").split(",").filter(Boolean);
    if (!paths.length || paths.length > 100)
      throw Error("Select 1–100 explicit fictional receipts.");
    const report = compareReceipts(
      await Promise.all(
        paths.map(async (p) => JSON.parse(await readFile(p, "utf8"))),
      ),
    );
    await save(
      arg("out", ".runtime/agent-quality/operational-comparison.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        cases: report.cases.length,
        receipts: paths.length,
        qualityScored: false,
        modelCalls: 0,
      }),
    );
    return;
  }
  if (mode === "calibrate") {
    const human = JSON.parse(await readFile(arg("human"), "utf8")),
      judge = JSON.parse(await readFile(arg("judge"), "utf8"));
    const report = judgeCalibration(human, judge);
    await save(
      arg("out", ".runtime/agent-quality/judge-calibration.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
    return;
  }
  throw Error(
    "This reader supports offline review, plans, compare and calibrate. Explicit real plan runs use run-plan-case.ts and evaluate-plans.ts.",
  );
}
main().catch((e) => {
  console.error(
    e instanceof Error ? e.message : "Evaluation preparation failed.",
  );
  process.exitCode = 1;
});
