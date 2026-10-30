// ABOUTME: One deterministic owner of target selection, three-model replay and review policy.
// ABOUTME: Numerical updates never depend on LLM availability or silently tighten accepted targets.
import { createHash } from "node:crypto";
import {
  addDays,
  daysBetween,
  dateInZone,
  targetOnDate,
  CoachRequestSchema,
  type CoachInput,
  type CoachRequest,
  type ContextAssessment,
  type Decision,
  type TargetRevision,
  type Proposal,
  type ForecastSnapshot,
  type ModelPoint,
  type ModelResult,
} from "../domain/contracts";
import { enforceContext } from "../domain/context";
import {
  estimateBaseline,
  resolveTrajectory,
  resolveDay,
  INPUT_POLICY_VERSION,
  type InputContext,
} from "./inputs";
import { MODEL_REGISTRY, simulateModel } from "./models";
import { pointMeetsGoal as meets, GOAL_TOLERANCE } from "./goal-policy";
export const REVIEW_POLICY = {
  windowDays: 7,
  minWeighIns: 3,
  minIntakes: 5,
  residualKg: 0.5,
  residualFraction: 0.005,
  missKg: 0.5,
  intakeKcal: 150,
  intakeFraction: 0.1,
  cooldownDays: 7,
} as const;
export interface PlanningOutcome {
  forecast: ForecastSnapshot | null;
  decision: Decision;
  targetRevisions: TargetRevision[];
}
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const grid = (x: number) => Math.round(x / 25) * 25;
function decision(
  status: Decision["status"],
  code: string,
  title: string,
  summary: string,
): Decision {
  return {
    status,
    code,
    title,
    summary,
    facts: [],
    proposal: null,
    reviewMetrics: [],
  };
}
function floor(r: CoachRequest, tdee: number): number {
  return Math.max(
    r.profile.sex === "male" ? 1500 : 1200,
    tdee - Math.min(750, tdee * 0.25),
  );
}
function initialPlan(r: CoachRequest): TargetRevision {
  const b = estimateBaseline(r.profile),
    lowBound = Math.ceil(floor(r, b.tdeeKcal) / 25) * 25,
    max = Math.floor(b.tdeeKcal / 25) * 25;
  if (lowBound > max)
    throw new Error(
      "The physiology estimate cannot support this prototype's calorie-planning bounds.",
    );
  const endpointFor = (cal: number, days: number) =>
    simulateModel("hall", {
      profile: r.profile,
      baseline: b,
      dates: Array.from({ length: days + 1 }, (_, i) =>
        addDays(r.profile.startDate, i),
      ),
      intakes: Array(days).fill(cal),
      activityDeltas: Array(days).fill(0),
    }).points.at(-1)!;
  let calories: number, targetDate: string;
  if (r.goal.requestedDate) {
    targetDate = r.goal.requestedDate;
    let lo = lowBound,
      hi = max;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (
        meets(
          endpointFor(mid, daysBetween(r.profile.startDate, targetDate)),
          r.goal,
        )
      )
        lo = mid;
      else hi = mid;
    }
    calories = Math.max(lowBound, Math.min(max, grid((lo + hi) / 2)));
  } else {
    calories = Math.max(lowBound, Math.min(max, grid(b.tdeeKcal * 0.8)));
    const points = simulateModel("hall", {
      profile: r.profile,
      baseline: b,
      dates: Array.from({ length: 366 }, (_, i) =>
        addDays(r.profile.startDate, i),
      ),
      intakes: Array(365).fill(calories),
      activityDeltas: Array(365).fill(0),
    }).points;
    targetDate =
      points.find((p, i) => i >= 7 && meets(p, r.goal))?.date ??
      addDays(r.profile.startDate, 365);
  }
  return {
    effectiveFrom: r.profile.startDate,
    dailyCalories: calories,
    targetDate,
    mode: "loss",
    goalId: r.goal.id,
  };
}
function runScenario(
  r: CoachRequest,
  targets: TargetRevision[],
  asOf: string,
  end: string,
  scenario: "accepted" | "current",
  multiplier = r.preferences.missingMealMultiplier,
) {
  const c = {
    profile: r.profile,
    preferences: r.preferences,
    logs: r.logs,
    targetRevisions: targets,
  };
  const days = resolveTrajectory(c, asOf, end, scenario, multiplier);
  return {
    days,
    input: {
      profile: r.profile,
      baseline: estimateBaseline(r.profile),
      dates: [...days.map((d) => d.date), end],
      intakes: days.map((d) => d.intakeKcal),
      activityDeltas: days.map((d) => d.activityDeltaKcalPerKgDay),
    },
  };
}
function calculate(
  r: CoachRequest,
  targets: TargetRevision[],
  asOf: string,
): ForecastSnapshot {
  const targetDate = targets.at(-1)!.targetDate;
  const end = targetDate > asOf ? targetDate : addDays(asOf, 28);
  if (daysBetween(r.profile.startDate, end) > 365)
    throw new Error("The forecast exceeds the original 365-day horizon.");
  const accepted = runScenario(r, targets, asOf, end, "accepted"),
    current = runScenario(r, targets, asOf, end, "current"),
    low = runScenario(r, targets, asOf, end, "current", 1),
    high = runScenario(r, targets, asOf, end, "current", 2);
  const results: ModelResult[] = (
    Object.keys(MODEL_REGISTRY) as (keyof typeof MODEL_REGISTRY)[]
  ).map((id) => {
    const meta = MODEL_REGISTRY[id];
    try {
      const a = simulateModel(id, accepted.input),
        c = simulateModel(id, current.input),
        l = simulateModel(id, low.input),
        h = simulateModel(id, high.input);
      return {
        id,
        equationVersion: meta.equationVersion,
        implementationVersion: meta.implementationVersion,
        composition: meta.composition,
        status: "ok",
        error: null,
        accepted: a.points,
        current: c.points,
        sensitivity: { lower: l.points, upper: h.points },
        diagnostics: a.diagnostics,
        parameters: a.parameters,
      };
    } catch (e) {
      if (id === "hall") throw e;
      return {
        id,
        equationVersion: meta.equationVersion,
        implementationVersion: meta.implementationVersion,
        composition: meta.composition,
        status: "failed",
        error:
          e instanceof Error
            ? e.message
            : "This model could not represent the inputs.",
        accepted: [],
        current: [],
        sensitivity: { lower: [], upper: [] },
        diagnostics: [],
        parameters: {},
      };
    }
  });
  const hall = results[0],
    window = current.days.filter(
      (d) => d.completed && daysBetween(d.date, asOf) <= 7,
    ),
    historical = current.days.filter((d) => d.completed);
  const weightErrors = r.logs
    .filter((l) => l.weightKg !== null)
    .map((l) => {
      const predicted = hall.current.find((p) => p.date === l.date)!;
      return {
        date: l.date,
        actualKg: l.weightKg!,
        predictedKg: predicted.weightKg,
        residualKg: l.weightKg! - predicted.weightKg,
      };
    });
  const bodyFatErrors = r.logs
    .filter((l) => l.bodyFat !== null)
    .map((l) => {
      const predicted = hall.current.find((p) => p.date === l.date)!;
      return {
        date: l.date,
        actualPct: l.bodyFat!.percent,
        predictedPct: predicted.bodyFatPct!,
        residualPct: l.bodyFat!.percent - predicted.bodyFatPct!,
        method: l.bodyFat!.method,
      };
    });
  const missing = (days: typeof historical) =>
    days.reduce(
      (a, d) => a + d.meals.filter((m) => m.source === "imputed_plan").length,
      0,
    );
  return {
    inputHash: createHash("sha256")
      .update(
        JSON.stringify({
          profile: r.profile,
          goal: r.goal,
          preferences: r.preferences,
          logs: r.logs,
          targets,
          asOf,
          policy: INPUT_POLICY_VERSION,
          models: MODEL_REGISTRY,
        }),
      )
      .digest("hex"),
    policyVersion: INPUT_POLICY_VERSION,
    inputPolicy: {
      missingMealMultiplier: r.preferences.missingMealMultiplier,
      rollingWindowDays: 7,
      timezone: r.profile.timezone,
    },
    asOfDate: asOf,
    baselineDate: r.profile.startDate,
    targetDate,
    projectionDate: end,
    baseline: accepted.input.baseline,
    modelResults: results,
    resolvedDays: current.days,
    goalOutcomes: {
      accepted: targetDate >= asOf && meets(hall.accepted.at(-1), r.goal),
      current: targetDate >= asOf && meets(hall.current.at(-1), r.goal),
    },
    weightErrors,
    bodyFatErrors,
    coverage: {
      windowDays: 7,
      recordedBudgetShare: window.length
        ? mean(window.map((d) => d.recordedBudgetShare))
        : 0,
      completedDays: window.length,
      recordedDays: window.filter((d) => d.recordedBudgetShare >= 1 - 1e-8)
        .length,
      missingMeals: missing(window),
      activityDays: window.filter((d) => d.activitySource === "recorded")
        .length,
      weightDays: weightErrors.filter((e) => daysBetween(e.date, asOf) < 7)
        .length,
      totalMissingMeals: missing(historical),
    },
    assumptions: [
      `Original physiology remains ${r.profile.weightKg} kg on ${r.profile.startDate}; observations never reinitialize it or shift model curves.`,
      `Initial activity: PAL ${accepted.input.baseline.pal}, source ${accepted.input.baseline.activitySource}. Future training capacity is not completed exercise.`,
      `Initial body fat: ${accepted.input.baseline.bodyFatPct.toFixed(1)}%, source ${accepted.input.baseline.bodyFatSource}. Fat-free mass includes water and is not muscle mass.`,
      `Missing completed meals use each date's accepted meal budget × ${r.preferences.missingMealMultiplier}. ${missing(historical)} meal budgets have been imputed; they remain assumptions, not diary facts.`,
      "Whole-day totals take precedence by intake mode. Explicit skipped meals are zero; unknown meals are not zero. Today's pending meals use the plan and are not counted as completed missing meals.",
      "Current-pattern inputs use seven completed calendar days; days before the baseline use the initial plan/activity as a prior. Historical inputs replay individually. Future scenarios cannot change earlier states.",
      "Activity deltas use net MET-hours relative to the baseline routine. Steps and action checkmarks add no exercise expenditure. Seven-day smoothing is a product policy; three-day smoothing is an eval comparator.",
      "The shaded input sensitivity range uses missing-meal multipliers 1.0 and 2.0. It is not a confidence interval and excludes other model and reporting errors.",
      "Three models share initial TDEE and composition inputs. Their original internal expenditure and adaptation equations differ. They are neither averaged nor silently substituted.",
      "Hall carbohydrate share remains 50% and sodium change zero. Calorie bounds, 20% undated-goal starting deficit, protein reference and review triggers are product policies, not an individualized clinical protocol.",
    ],
  };
}
function proposalFor(
  r: CoachRequest,
  targets: TargetRevision[],
  asOf: string,
  f: ForecastSnapshot,
  kind: Proposal["kind"],
  reason: string,
): Proposal | null {
  const active = targetOnDate(targets, asOf) ?? targets[0],
    effectiveFrom = addDays(asOf, 1),
    max = addDays(r.profile.startDate, 365);
  const maintenance =
    f.modelResults
      .find((m) => m.id === "hall")!
      .current.find((p) => p.date === asOf)?.expenditureKcal ??
    f.baseline.tdeeKcal;
  const calories =
    kind === "maintenance" ? grid(maintenance) : active.dailyCalories;
  let date =
    kind === "maintenance"
      ? addDays(asOf, 56)
      : addDays(active.targetDate > asOf ? active.targetDate : asOf, 14);
  date = date > max ? max : date;
  if (
    date <= effectiveFrom ||
    (kind === "extend_timeline" && date <= active.targetDate)
  )
    return null;
  let point: ModelPoint | undefined;
  for (let i = 0; i < 26; i++) {
    const next = {
      effectiveFrom,
      dailyCalories: calories,
      targetDate: date,
      mode:
        kind === "maintenance" ? ("maintenance" as const) : ("loss" as const),
      goalId: r.goal.id,
    };
    const input = runScenario(r, [...targets, next], asOf, date, "accepted");
    point = simulateModel("hall", input.input).points.at(-1);
    if (kind === "maintenance" || meets(point, r.goal) || date >= max) break;
    date = addDays(date, 14) > max ? max : addDays(date, 14);
  }
  return {
    id: createHash("sha256")
      .update(
        JSON.stringify({
          hash: f.inputHash,
          kind,
          date,
          calories,
          effectiveFrom,
        }),
      )
      .digest("hex")
      .slice(0, 20),
    kind,
    title:
      kind === "maintenance"
        ? "Review maintenance"
        : "Keep the target, allow more time",
    reason,
    dailyCalories: calories,
    targetDate: date,
    projectedWeightKg: point!.weightKg,
    effectiveFrom,
  };
}
export function evaluatePlanning(
  raw: CoachInput,
  candidate?: ContextAssessment,
): PlanningOutcome {
  const r = CoachRequestSchema.parse(raw),
    asOf = r.asOfDate ?? dateInZone(r.profile.timezone),
    context = enforceContext(r, candidate);
  const blocked = (
    code: string,
    title: string,
    summary: string,
    status: Decision["status"] = "paused",
  ): PlanningOutcome => ({
    forecast: null,
    targetRevisions: r.targetRevisions,
    decision: decision(status, code, title, summary),
  });
  if (
    context.applicability !== "standard" ||
    context.signals.some(
      (s) => s.kind === "unsupported" || s.kind === "urgent_symptom",
    )
  )
    return blocked(
      "scope",
      "Pause numerical weight-loss planning",
      context.reason ??
        context.signals.find((s) => s.kind !== "low_feasibility")?.label ??
        "This situation needs guidance outside this adult prototype.",
      context.applicability === "needs_confirmation"
        ? "needs_confirmation"
        : "paused",
    );
  const g = r.goal,
    p = r.profile;
  if (
    (g.kind === "weight" &&
      (g.value >= p.weightKg || g.value / (p.heightCm / 100) ** 2 < 18.5)) ||
    (g.kind === "body_fat" &&
      (g.value < (p.sex === "male" ? 15 : 23) ||
        g.value >= estimateBaseline(p).bodyFatPct))
  )
    return blocked(
      "goal_range",
      "Review the goal",
      "The goal is outside this prototype's self-guided planning range. Body-fat lower bounds are product support limits, not medical standards.",
      "needs_confirmation",
    );
  if (
    g.requestedDate &&
    (daysBetween(p.startDate, g.requestedDate) < 7 ||
      daysBetween(p.startDate, g.requestedDate) > 365)
  )
    return blocked(
      "goal_date",
      "Review the date",
      "Choose a date 7–365 days after the original baseline.",
      "needs_confirmation",
    );
  if (daysBetween(p.startDate, asOf) > 330)
    return blocked(
      "model_horizon",
      "Start a fresh review",
      "The plan is beyond the supported review horizon.",
    );
  const weights = [
    { date: p.startDate, weightKg: p.weightKg },
    ...r.logs
      .filter((l) => l.weightKg !== null)
      .map((l) => ({ date: l.date, weightKg: l.weightKg! })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const latest = weights.at(-1)!;
  if (latest.weightKg / (p.heightCm / 100) ** 2 < 18.5)
    return blocked(
      "weight_range",
      "Confirm this weight",
      "Keep the record and check its units before planning.",
      "needs_confirmation",
    );
  for (let i = 1; i < weights.length; i++) {
    if (daysBetween(weights[i].date, asOf) > 7) continue;
    const change = Math.abs(weights[i].weightKg - weights[i - 1].weightKg),
      gap = daysBetween(weights[i - 1].date, weights[i].date);
    if (
      (gap <= 3 && change > Math.max(3, weights[i - 1].weightKg * 0.05)) ||
      (gap <= 7 && change > weights[i - 1].weightKg * 0.08)
    )
      return blocked(
        "measurement_jump",
        "Check the new measurement",
        "A short-interval change may be a recording or unit error. Confirm it before using the forecast.",
        "needs_confirmation",
      );
  }
  let targets = r.targetRevisions.length
    ? [...r.targetRevisions]
    : [initialPlan(r)];
  const b = estimateBaseline(p);
  if (
    targets.some(
      (t) =>
        t.dailyCalories < floor(r, b.tdeeKcal) ||
        t.dailyCalories > b.tdeeKcal * 1.3,
    )
  )
    return blocked(
      "plan_bounds",
      "Review the saved target",
      "The saved numerical target is outside supported bounds; it has not been applied.",
    );
  const c: InputContext = {
    profile: p,
    preferences: r.preferences,
    logs: r.logs,
    targetRevisions: targets,
  };
  if (
    r.logs.some(
      (l) =>
        l.date <= asOf &&
        daysBetween(l.date, asOf) < 7 &&
        resolveDay(c, l.date, asOf).recordedBudgetShare >= 1 - 1e-8 &&
        resolveDay(c, l.date, asOf).intakeKcal < 800,
    )
  )
    return blocked(
      "low_intake",
      "Check the complete intake record",
      "A fully recorded day is below this prototype's supported range. Partial intake must stay partial.",
      "needs_confirmation",
    );
  let f = calculate(r, targets, asOf);
  const review = (forecast: ForecastSnapshot): Decision => {
    const active = targetOnDate(targets, asOf) ?? targets[0],
      pending = targets.find((t) => t.effectiveFrom > asOf),
      d = decision(
        active.mode === "maintenance" ? "maintenance" : "active",
        "holding",
        "Your accepted target is unchanged",
        "New records update the prediction. They do not automatically tighten your calorie target.",
      );
    d.facts.push(
      `Accepted intake: ${active.dailyCalories} kcal/day. ${forecast.coverage.missingMeals} recent meals use explicit assumptions.`,
      `Model estimate and actual measurements are displayed separately; no residual offset or metabolic fitting is applied.`,
    );
    d.reviewMetrics = [
      "Review sustained deviations using two seven-day windows with at least three weights each. Missing-meal assumptions are not evidence of overeating.",
      "Ordinary accepted revisions have a seven-day cooldown. Safety and applicability checks take priority.",
      "These are product review rules, not validated clinical thresholds.",
    ];
    if (pending) {
      d.code = "pending_revision";
      d.title = "Your accepted revision is scheduled";
      d.summary = `The accepted ${pending.mode} target begins on ${pending.effectiveFrom}. ${pending.mode === "maintenance" ? "Further loss targets remain withheld until then." : "Today's target is unchanged."}`;
      return d;
    }
    if (active.mode === "maintenance") return d;
    const fat = r.logs
      .filter((l) => l.bodyFat)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1)?.bodyFat;
    const achieved =
      g.kind === "weight"
        ? latest.weightKg <= g.value + GOAL_TOLERANCE
        : Boolean(fat && fat.percent <= g.value);
    const prev = forecast.weightErrors.filter(
        (e) => daysBetween(e.date, asOf) >= 7 && daysBetween(e.date, asOf) < 14,
      ),
      now = forecast.weightErrors.filter((e) => daysBetween(e.date, asOf) < 7);
    const sustained =
      prev.length >= 3 &&
      now.length >= 3 &&
      mean(prev.map((e) => e.residualKg)) >=
        Math.max(0.5, p.weightKg * 0.005) &&
      mean(now.map((e) => e.residualKg)) >= Math.max(0.5, p.weightKg * 0.005);
    const known = forecast.resolvedDays.filter(
      (d) =>
        d.completed &&
        daysBetween(d.date, asOf) <= 7 &&
        d.recordedBudgetShare >= 1 - 1e-8,
    );
    const high =
      known.length >= 5 &&
      mean(known.map((d) => d.intakeKcal)) >
        active.dailyCalories + Math.max(150, active.dailyCalories * 0.1);
    const expired = active.targetDate <= asOf,
      cooling =
        targets.indexOf(active) > 0 &&
        daysBetween(active.effectiveFrom, asOf) < 7;
    const first = targets[0],
      initialDays = daysBetween(p.startDate, first.targetDate);
    const initialGap =
      targets.length === 1 &&
      !meets(
        simulateModel("hall", {
          profile: p,
          baseline: forecast.baseline,
          dates: Array.from({ length: initialDays + 1 }, (_, i) =>
            addDays(p.startDate, i),
          ),
          intakes: Array(initialDays).fill(first.dailyCalories),
          activityDeltas: Array(initialDays).fill(0),
        }).points.at(-1),
        g,
      );
    if (achieved) {
      d.status = "review";
      d.code = "goal_reached";
      d.title = "Review the measurement and maintenance";
      d.summary =
        "A reported measurement is at the goal. Confirm the measurement before accepting maintenance.";
      d.proposal = proposalFor(
        r,
        targets,
        asOf,
        forecast,
        "maintenance",
        "Review maintenance rather than automatically continuing a deficit.",
      );
    } else if (
      expired ||
      (!cooling &&
        (sustained ||
          high ||
          initialGap ||
          context.signals.some((s) => s.kind === "low_feasibility")))
    ) {
      d.status = "review";
      d.code = expired
        ? "timeline_ended"
        : sustained
          ? "persistent_deviation"
          : high
            ? "execution_gap"
            : initialGap
              ? "goal_gap"
              : "feasibility";
      d.title = "Review the timeline and practical constraints";
      d.summary =
        "Keep the accepted calorie target. A longer timeline remains a proposal until you accept.";
      d.proposal = proposalFor(
        r,
        targets,
        asOf,
        forecast,
        "extend_timeline",
        d.summary,
      );
    }
    return d;
  };
  let d = review(f);
  if (r.action === "accept") {
    if (!d.proposal || d.proposal.id !== r.acceptProposalId)
      throw new Error(
        "That proposal is no longer current. Refresh before accepting it.",
      );
    const next: TargetRevision = {
      effectiveFrom: d.proposal.effectiveFrom,
      dailyCalories: d.proposal.dailyCalories,
      targetDate: d.proposal.targetDate,
      mode: d.proposal.kind === "maintenance" ? "maintenance" : "loss",
      goalId: g.id,
    };
    if (targets.some((t) => t.effectiveFrom >= next.effectiveFrom))
      throw new Error("An accepted revision already exists for that date.");
    targets = [...targets, next];
    f = calculate(r, targets, asOf);
    d = review(f);
    d.facts.push(
      `You accepted the ${next.mode} revision from ${next.effectiveFrom}; earlier targets remain unchanged.`,
    );
  }
  const pendingMaintenance = targets.some(
    (t) => t.mode === "maintenance" && t.effectiveFrom > asOf,
  );
  return {
    forecast: d.code === "goal_reached" || pendingMaintenance ? null : f,
    decision: d,
    targetRevisions: targets,
  };
}
export function calculateForecast(raw: CoachInput): ForecastSnapshot {
  const result = evaluatePlanning(raw);
  if (!result.forecast) throw new Error(result.decision.summary);
  return result.forecast;
}
