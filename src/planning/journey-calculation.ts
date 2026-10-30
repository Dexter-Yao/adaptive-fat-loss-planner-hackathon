// ABOUTME: Deterministic measurement-first forecasts and calculator-checked candidate targets.
// ABOUTME: Measurements condition internal states; absent food tracking remains an accepted-plan assumption.
import { createHash } from "node:crypto";
import {
  CalculationRequestSchema,
  CalculationResponseSchema,
  type CalculationRequest,
  type CalculationResponse,
} from "../domain/workflow";
import {
  addDays,
  daysBetween,
  targetOnDate,
  type TargetRevision,
} from "../domain/facts";
import {
  ForecastSnapshotSchema,
  type ForecastSnapshot,
  type ModelPoint,
  type ModelResult,
} from "../domain/forecast";
import { CONDITIONING_VERSION } from "../domain/model-state";
import { enforceContext } from "../domain/context";
import { CoachRequestSchema } from "../domain/coach";
import { evaluatePlanning } from "./evaluate";
import { estimateBaseline, resolveDay, type InputContext } from "./inputs";
import { MODEL_REGISTRY, simulateModel, type SimulationInput } from "./models";

import { pointMeetsGoal } from "./goal-policy";
export const targetScheduleHash = (targets: TargetRevision[]) =>
  createHash("sha256").update(JSON.stringify(targets)).digest("hex");

/** Same input policy for all models; only already-saved food/activity facts override the plan. */
function resolvedInputs(
  r: CalculationRequest,
  targets: TargetRevision[],
  end: string,
) {
  const c: InputContext = {
    profile: r.profile,
    preferences: r.preferences,
    logs: r.logs,
    targetRevisions: targets,
  };
  return Array.from(
    { length: daysBetween(r.profile.startDate, end) },
    (_, i) => {
      const date = addDays(r.profile.startDate, i),
        historical = date <= r.binding.asOfDate,
        log = historical ? r.logs.find((l) => l.date === date) : undefined;
      const day = resolveDay(
        { ...c, logs: log ? [log] : [] },
        date,
        r.binding.asOfDate,
        log?.intake ? r.preferences.missingMealMultiplier : 1,
      );
      if (!log?.intake) {
        day.intakeSource = "planned";
        day.meals = day.meals.map((m) => ({
          ...m,
          source: "planned",
          multiplier: null,
        }));
      }
      return day;
    },
  );
}

function forecast(
  r: CalculationRequest,
  targets: TargetRevision[],
  end: string,
): ForecastSnapshot {
  const days = resolvedInputs(r, targets, end),
    baseline = estimateBaseline(r.profile),
    dates = [...days.map((d) => d.date), end],
    cutoff = r.binding.asOfDate;
  const input: SimulationInput = {
    profile: r.profile,
    baseline,
    dates,
    intakes: days.map((d) => d.intakeKcal),
    activityDeltas: days.map((d) => d.activityDeltaKcalPerKgDay),
    measurements: r.logs
      .filter(
        (l) => l.date <= cutoff && (l.weightKg !== null || l.bodyFat !== null),
      )
      .map((l) => ({
        day: daysBetween(r.profile.startDate, l.date),
        weightKg: l.weightKg,
        bodyFatPct: l.bodyFat?.percent ?? null,
        method: l.bodyFat?.method ?? null,
      }))
      .sort((a, b) => a.day - b.day),
  };
  const conditioning: NonNullable<ForecastSnapshot["conditioning"]> = {
    version: CONDITIONING_VERSION,
    cutoff,
    assumptionMode: "accepted_plan",
    models: [],
  };
  const results: ModelResult[] = (
    Object.keys(MODEL_REGISTRY) as (keyof typeof MODEL_REGISTRY)[]
  ).map((id) => {
    const meta = MODEL_REGISTRY[id];
    try {
      const current = simulateModel(id, input),
        reference = simulateModel(id, { ...input, measurements: [] });
      conditioning.models.push({
        id,
        checkpoint:
          current.checkpoints.find(
            (c) => c.day === daysBetween(r.profile.startDate, cutoff),
          ) ?? null,
        events: current.events.map(({ day, ...e }) => ({
          ...e,
          date: addDays(r.profile.startDate, day),
        })),
      });
      return {
        id,
        equationVersion: meta.equationVersion,
        implementationVersion: meta.implementationVersion,
        composition: meta.composition,
        status: "ok",
        error: null,
        diagnostics: current.diagnostics,
        parameters: current.parameters,
        accepted: reference.points,
        current: current.points,
        sensitivity: { lower: current.points, upper: current.points },
      };
    } catch (e) {
      if (id === "hall") throw e;
      conditioning.models.push({ id, checkpoint: null, events: [] });
      return {
        id,
        equationVersion: meta.equationVersion,
        implementationVersion: meta.implementationVersion,
        composition: meta.composition,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
        diagnostics: [],
        parameters: {},
        accepted: [],
        current: [],
        sensitivity: { lower: [], upper: [] },
      };
    }
  });
  const hall = results[0],
    events = conditioning.models[0].events,
    targetDate = targets.at(-1)!.targetDate;
  const meets = (p: ModelPoint | undefined) => pointMeetsGoal(p, r.goal);
  const window = days.filter(
    (d) => d.completed && daysBetween(d.date, cutoff) <= 7,
  );
  return ForecastSnapshotSchema.parse({
    conditioning,
    inputHash: createHash("sha256")
      .update(
        JSON.stringify({
          profile: r.profile,
          goal: r.goal,
          preferences: r.preferences,
          targets,
          inputs: days,
          measurements: input.measurements,
          cutoff,
          end,
          version: CONDITIONING_VERSION,
          models: MODEL_REGISTRY,
        }),
      )
      .digest("hex"),
    inputPolicy: {
      missingMealMultiplier: r.preferences.missingMealMultiplier,
      rollingWindowDays: 7,
      timezone: r.profile.timezone,
    },
    policyVersion: "measurement-first-accepted-plan-v1",
    asOfDate: cutoff,
    baselineDate: r.profile.startDate,
    targetDate,
    projectionDate: end,
    baseline,
    modelResults: results,
    resolvedDays: days,
    goalOutcomes: {
      accepted: meets(hall.accepted.find((p) => p.date === targetDate)),
      current: meets(hall.current.find((p) => p.date === targetDate)),
    },
    weightErrors: events
      .filter((e) => e.observedWeightKg !== null)
      .map((e) => ({
        date: e.date,
        actualKg: e.observedWeightKg!,
        predictedKg: e.priorWeightKg,
        residualKg: e.observedWeightKg! - e.priorWeightKg,
      })),
    bodyFatErrors: events
      .filter((e) => e.observedBodyFatPct !== null)
      .map((e) => ({
        date: e.date,
        actualPct: e.observedBodyFatPct!,
        predictedPct: e.priorBodyFatPct!,
        residualPct: e.observedBodyFatPct! - e.priorBodyFatPct!,
        method: e.method ?? "other",
      })),
    coverage: {
      windowDays: 7,
      recordedBudgetShare: window.length
        ? window.reduce((a, d) => a + d.recordedBudgetShare, 0) / window.length
        : 0,
      completedDays: window.length,
      recordedDays: window.filter((d) => d.recordedBudgetShare >= 1 - 1e-8)
        .length,
      missingMeals: window
        .flatMap((d) => d.meals)
        .filter((m) => m.source === "imputed_plan").length,
      totalMissingMeals: days
        .flatMap((d) => d.meals)
        .filter((m) => m.source === "imputed_plan").length,
      activityDays: window.filter((d) => d.activitySource === "recorded")
        .length,
      weightDays: events.filter(
        (e) => e.observedWeightKg !== null && daysBetween(e.date, cutoff) <= 7,
      ).length,
    },
    assumptions: [
      "The future assumes the accepted numerical targets and confirmed baseline activity; measurements do not infer actual eating or exercise.",
      "Original metabolic parameters are fixed. Check-ins condition existing internal states at the start of their date; later observations never alter earlier points.",
      "Weight-only structural allocation and body-fat conditioning are versioned application assumptions, not validated observation algorithms or proof of tissue loss.",
      "Body-fat-only updates use each composition model's estimated weight. Antonetti has no body-fat state. Measurement method and pre-update innovation remain explicit.",
      "Absent food entries do not imply overeating. Previously recorded food/activity facts are retained; explicit partial-meal assumptions remain derived inputs.",
      "No calibrated confidence band is supplied in measurement-first mode. Model disagreement is shown separately; identical band boundaries carry no accuracy claim.",
      "Hall retains glycogen, water and adaptation, with carbohydrate share one half and unchanged sodium. Thomas retains author-reference resting adaptation and activity limitations.",
    ],
  });
}

/** Recheck targets on the server; returned candidates never constitute acceptance. */
export function calculateJourney(raw: CalculationRequest): CalculationResponse {
  const r = CalculationRequestSchema.parse(raw),
    asOf = r.binding.asOfDate;
  const base = {
    sessionId: r.binding.sessionId,
    sourceRevision: r.binding.sourceRevision,
    asOfDate: asOf,
    actionsRevision: r.binding.actionsRevision,
    action: "update" as const,
    profile: r.profile,
    goal: r.goal,
    preferences: r.preferences,
    logs: r.logs,
    targetRevisions: r.targetRevisions,
  };
  const context = enforceContext(CoachRequestSchema.parse(base)),
    outcome = evaluatePlanning(base);
  let targets = outcome.targetRevisions;
  if (r.revision && targets.length) {
    if (
      outcome.decision.status === "paused" ||
      outcome.decision.status === "needs_confirmation"
    )
      throw new Error(
        "Resolve the scope or measurement check before proposing new numerical targets.",
      );
    const effectiveFrom = addDays(asOf, 1),
      active = targetOnDate(targets, asOf) ?? targets[0];
    if (
      r.revision.targetDate <= effectiveFrom ||
      r.revision.targetDate > addDays(r.profile.startDate, 365) ||
      targets.some((t) => t.effectiveFrom >= effectiveFrom)
    )
      throw new Error(
        "Choose a future revision within the original horizon; a pending target cannot be overwritten.",
      );
    const at = forecast(
      r,
      targets,
      r.projectionDate ??
        (active.targetDate > asOf ? active.targetDate : addDays(asOf, 28)),
    ).modelResults[0].current.find((p) => p.date === asOf)!;
    const calories =
      r.revision.mode === "maintenance"
        ? Math.round(at.expenditureKcal! / 25) * 25
        : active.dailyCalories;
    if (
      r.revision.mode === "loss" &&
      r.revision.targetDate <= active.targetDate
    )
      throw new Error(
        "An ordinary revision keeps calories and allows more time; it cannot silently tighten the timeline.",
      );
    targets = [
      ...targets,
      {
        effectiveFrom,
        dailyCalories: calories,
        targetDate: r.revision.targetDate,
        mode: r.revision.mode,
        goalId: r.goal.id,
      },
    ];
    const checked = evaluatePlanning({ ...base, targetRevisions: targets });
    if (
      checked.decision.status === "paused" ||
      checked.decision.status === "needs_confirmation"
    )
      throw new Error(checked.decision.summary);
  }
  const end =
    r.projectionDate ??
    (targets.at(-1)?.targetDate && targets.at(-1)!.targetDate > asOf
      ? targets.at(-1)!.targetDate
      : addDays(asOf, 28));
  if (end <= asOf || daysBetween(r.profile.startDate, end) > 365)
    throw new Error(
      "The common comparison endpoint must be future-dated inside the original horizon.",
    );
  const blocked = ["paused", "needs_confirmation"].includes(
    outcome.decision.status,
  );
  const f = blocked || !targets.length ? null : forecast(r, targets, end);
  const unsupported = f?.conditioning?.models
    .find((m) => m.id === "hall")
    ?.events.some((e) => e.status === "unsupported");
  const active = targetOnDate(targets, asOf) ?? targets[0],
    elapsed = Boolean(active && active.targetDate <= asOf),
    goalReached = outcome.decision.code === "goal_reached";
  const review = Boolean(
    r.revision || elapsed || goalReached || (f && !f.goalOutcomes.current),
  );
  const baseDecision = blocked
    ? outcome.decision
    : {
        status: review
          ? ("review" as const)
          : active?.mode === "maintenance"
            ? ("maintenance" as const)
            : ("active" as const),
        code: r.revision
          ? "candidate_revision"
          : goalReached
            ? "goal_reached"
            : elapsed
              ? "timeline_ended"
              : f && !f.goalOutcomes.current
                ? "goal_gap"
                : "holding",
        title:
          r.revision || !r.targetRevisions.length
            ? "Review the calculated proposal"
            : review
              ? "Review progress and assumptions"
              : "Your accepted target is unchanged",
        summary: goalReached
          ? "A reported measurement is at the goal. Confirm it and review maintenance; do not automatically continue a deficit."
          : elapsed
            ? "The accepted date has elapsed. Review a future timeline before generating a revised journey."
            : review
              ? "The projection is conditional on the displayed assumptions. A change remains a proposal until you accept it."
              : "Measurements update the conditional projection, not the accepted numerical targets.",
        facts: active
          ? [
              `Displayed intake: ${active.dailyCalories} kcal/day.`,
              "Actual measurements, state-conditioning assumptions and the immutable accepted reference remain distinct.",
            ]
          : [],
        proposal: null,
        reviewMetrics: [
          "Coach eligibility compares projections at one identical future date against the accepted reference.",
          "Sparse measurements cannot identify actual food intake, exercise, metabolism or the cause of a deviation.",
        ],
      };
  const decision = unsupported
    ? {
        ...baseDecision,
        status: "needs_confirmation" as const,
        code: "conditioning_limit",
        title: "Review the measurement",
        summary:
          "The record is retained, but no compatible state supports this measurement. Loss guidance is withheld.",
        proposal: null,
      }
    : { ...baseDecision, proposal: null };
  return CalculationResponseSchema.parse({
    kind: "journey_calculation",
    binding: r.binding,
    snapshot: {
      sourceRevision: r.binding.sourceRevision,
      asOfDate: asOf,
      forecast: f,
      decision,
      context,
      explanation: null,
      provider: null,
      model: null,
      toolCalls: [],
    },
    proposedTargets: targets,
    targetScheduleHash: targetScheduleHash(targets),
  });
}
