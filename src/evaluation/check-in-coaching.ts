// ABOUTME: Coach-specific fictional scenarios over a recorded accepted J03 plan and dated history prefixes.
// ABOUTME: Assertions are narrow implementer checks, not a complete-plan judge, human verdict or clinical evaluation.
import { reviewSuite } from "./review-suite";
import type {
  MeasurementUpdate,
  StageRequest,
  StageResponse,
} from "../domain/workflow";

export const CHECK_IN_EVALUATION_VERSION = "check-in-core-2026-10-30-v3";
export interface CheckInScenario {
  id: string;
  purpose: string;
  provenance: string;
  measurements: MeasurementUpdate[];
  supportedRecommendations: string[];
}

/** Variations are explicitly fictional; prefixes never contain a later report or invented completed action. */
export function checkInScenarios(): CheckInScenario[] {
  const c = reviewSuite.cases.find((c) => c.id === "J03")!;
  const prefix = (n: number) =>
    structuredClone(c.checkIns.slice(0, n).map((e) => e.measurement));
  const closure =
    "虚构测试更新：公司食堂临时关闭，午餐只能在附近便利店买。我看见茶叶蛋、即食豆腐、米饭和沙拉，不想买酸奶，也不希望额外备餐或记录饮食。希望用这些现成选项灵活处理午餐，不要因为一条体重就收紧方案。";
  return [
    {
      id: "quiet",
      purpose:
        "Ordinary manageable update; no invented obstacle or intervention.",
      provenance: "Approved J03 first check-in, identical recorded input.",
      measurements: prefix(1),
      supportedRecommendations: ["keep_plan"],
    },
    {
      id: "single-noise",
      purpose:
        "One non-comparable reading needs remeasurement, not target tightening.",
      provenance:
        "Fictional variation on the first J03 date; replaces, never supplements, that day's reading.",
      measurements: [
        {
          date: "2026-06-08",
          weightKg: 83.1,
          bodyFat: null,
          notes:
            "虚构噪声场景：这次是晚饭后穿外套、换了另一台秤量的，平常是周一早上同一台秤。现在还没有复测，饮食安排没有新困难。",
        },
      ],
      supportedRecommendations: ["remeasure"],
    },
    {
      id: "feasible-access",
      purpose:
        "A feasible future outlook can retain targets while a closed canteen needs adjust_execution now.",
      provenance:
        "Observed fictional Chinese browser obstacle/reading, explicitly adapted to J03's acceptance date. Not an additional historical J03 fact or a transferred human approval.",
      measurements: [
        {
          date: c.initialInput.profile.startDate,
          weightKg: 81.7,
          bodyFat: null,
          notes: closure,
        },
      ],
      supportedRecommendations: ["adjust_execution"],
    },
    {
      id: "repeated",
      purpose:
        "Repeated dated divergence warrants reviewing assumptions/feasibility, without assigning cause or applying a revision.",
      provenance:
        "Approved J03 first three dated check-ins, unmodified; only the available prefix is supplied.",
      measurements: prefix(3),
      supportedRecommendations: ["revise_plan", "remeasure"],
    },
    {
      id: "unknown-access",
      purpose:
        "Ask one decisive lunch-access question without inventing a shop, delivery, storage or food supply.",
      provenance:
        "Recorded J03 first two reports, then an explicitly fictional note on the latter date; no extra numerical measurement.",
      measurements: [
        ...prefix(1),
        {
          ...prefix(2)[1],
          notes:
            "虚构信息不足场景：公司食堂和原来点外卖的店都临时停业了；午休不能离开单位，也不知道还有什么现成午餐能拿到。我不想额外备餐、买酸奶或记录饮食。先别假设便利店、配送或冰箱能用。",
        },
      ],
      supportedRecommendations: ["remeasure"],
    },
    {
      id: "note-only-access",
      purpose:
        "A note-only access change receives a workaround without claiming a numerical energy input or new measurement.",
      provenance:
        "Recorded J03 first two numerical reports; only the second note is replaced by the observed fictional browser obstacle. No new weight/body-fat value.",
      measurements: [...prefix(2), { ...prefix(2)[1], notes: closure }],
      supportedRecommendations: ["adjust_execution"],
    },
  ];
}

export function coachScenarioAssertions(
  s: CheckInScenario,
  request: StageRequest,
  response: StageResponse | null,
) {
  const v = response?.stage === "review_progress" ? response.result : null;
  const prose = v
    ? [
        v.summary,
        v.uncertainty,
        v.question ?? "",
        v.proposedChangeSummary ?? "",
      ].join("\n")
    : "";
  const change = v?.proposedChangeSummary ?? "";
  const checks: Record<string, boolean> = {
    completedCoach: Boolean(v),
    supportedRecommendation: Boolean(
      v && s.supportedRecommendations.includes(v.recommendation),
    ),
    noFutureHistory: request.measurements.every(
      (m) => m.date <= request.binding.asOfDate,
    ),
    exactSourceEvidence: Boolean(
      v &&
        v.evidence.every((e) => request.sources[e.sourceId]?.includes(e.quote)),
    ),
    noInternalAssessmentInSavedDTO: Boolean(v && !("assessment" in v)),
  };
  if (["feasible-access", "note-only-access"].includes(s.id))
    Object.assign(checks, {
      availableVenue: /便利店/.test(change),
      availablePrimaryAndFallback:
        /豆腐/.test(change) &&
        /[蛋]/.test(change) &&
        /米饭|饭/.test(change) &&
        /沙拉/.test(change),
      explicitFallback: /如果|若|没有|售罄|缺货|买不到|缺/.test(change),
      noRedundantQuestion: v?.question === null,
      noBorrowedMenu:
        !/面条|面食|卤肉|鸡胸|冷拌|noodles|another.{0,12}(?:vegetable|protein)|其他蔬菜|另一种蛋白/i.test(
          change,
        ),
      noUnreportedKitchen: !/自己做|回家做|提前做|备好|冷藏|加热/.test(
        change.replace(/免加热|无需加热|不用加热|不需加热/g, ""),
      ),
    });
  if (s.id === "unknown-access")
    Object.assign(checks, {
      singleAccessQuestion: Boolean(
        v?.question &&
          /午餐|午饭|现成|现有|拿到|买到|获取/.test(v.question) &&
          (v.question.match(/[?？]/g)?.length ?? 0) === 1,
      ),
      noInventedProposal: v?.proposedChangeSummary === null,
    });
  if (s.id === "single-noise")
    checks.noInventedWeighingRoutine =
      !/(?:惯例|平常|以往|usual|routine).{0,70}(?:空腹|早餐前|轻便衣|fasted|fasting|light cloth)|(?:空腹|早餐前|轻便衣|fasted|fasting|light cloth).{0,70}(?:惯例|平常|以往|usual|routine)/i.test(
        prose,
      );
  if (s.measurements.some((m) => /[\u3400-\u9fff]/.test(m.notes)))
    checks.userLanguage = /[\u3400-\u9fff]/.test(prose);
  return {
    kind: "narrow_implementer_assertions",
    version: CHECK_IN_EVALUATION_VERSION,
    checks,
    failed: Object.entries(checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name),
    humanAnnotation: null,
    semanticQualityVerdict: null,
  };
}

/** Complete exact coach DTOs are visible; raw stage traces remain in sibling private receipts. */
export function coachReviewHtml(
  receipts: {
    scenario: CheckInScenario;
    result: StageResponse | null;
    assertions: unknown;
    error: string | null;
  }[],
) {
  const escape = (v: unknown) =>
    JSON.stringify(v, null, 2).replace(
      /[&<>]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!,
    );
  return `<!doctype html><meta charset="utf-8"><title>Check-in coaching — fictional core outputs</title><style>body{font:16px/1.6 system-ui;max-width:980px;margin:40px auto;padding:0 24px;color:#252525}section{border-top:1px solid #ddd;margin-top:32px;padding-top:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f7f6f3;padding:18px;border-radius:8px}summary{cursor:pointer}</style><h1>Check-in coaching: complete outputs</h1><p>Explicitly fictional J03 scenarios using a recorded, model-generated accepted plan. Acceptance in the original run was simulated. These are coach outputs and narrow implementer assertions, with no full-plan judge or human quality verdict. Each sibling JSON retains the complete request, traces, failures and usage.</p>${receipts.map((r) => `<section><h2>${r.scenario.id}</h2><p>${r.scenario.purpose}</p><p>${r.scenario.provenance}</p><details><summary>Exact scenario reports</summary><pre>${escape(r.scenario.measurements)}</pre></details><h3>Complete coach output</h3><pre>${escape(r.result?.stage === "review_progress" ? r.result.result : { error: r.error })}</pre><details><summary>Narrow assertions, not a quality verdict</summary><pre>${escape(r.assertions)}</pre></details></section>`).join("")}`;
}
