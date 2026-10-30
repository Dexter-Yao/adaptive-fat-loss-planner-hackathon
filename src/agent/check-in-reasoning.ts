// ABOUTME: Typed, dated evidence and independent decision checks for the progress coach's internal tool.
// ABOUTME: Residuals come only from the calculator before conditioning; this never estimates causes or changes policy.
import { z } from "zod";
import { daysBetween } from "../domain/facts";
import { ForecastSnapshotSchema } from "../domain/forecast";
import type { StageRequest } from "../domain/workflow";
import { CoachRecommendationSchema } from "../domain/journey";
import { pointMeetsGoal } from "../planning/goal-policy";

export const CHECK_IN_CONTEXT_VERSION = "check-in-reasoning-2026-10-30-v7";
export const CoachAssessmentSchema = z
  .object({
    numerical: z
      .enum([
        "continue_plan",
        "confirm_measurement",
        "review_projection",
        "withhold",
      ])
      .describe(
        "The NEXT numerical-review action, not whether accepted targets change: continue_plan for a quiet update, confirm_measurement when conditions differ/are unclear, review_projection for a calculator/user timing or assumption review, including explicitly reduced FUTURE activity willingness/capacity even without forecast reviewReasons, withhold for scope concerns. Every choice leaves accepted targets unchanged until explicit acceptance.",
      ),
    practical: z
      .enum(["no_new_obstacle", "workaround", "needs_information", "withhold"])
      .describe(
        "Use no_new_obstacle for a quiet update OR alongside review_projection when a stated future plan-constraint change needs review but no immediate access workaround is proposed. It does not deny that a future constraint was reported. Use workaround only for a CURRENT access/execution difficulty with a known primary and fallback; old/new activity budgets are not interchangeable resources. needs_information means one genuinely unanswered access question, not a question about an already stated capacity.",
      ),
    barrierQuote: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .nullable()
      .describe(
        "Exact short quotation of the CURRENT access/execution difficulty for workaround or needs_information. Null for a quiet update or review_projection + no_new_obstacle; cite a future plan-constraint change through evidence IDs and reviewProposal instead. A hypothetical accepted-plan obstacle is not a reported event.",
      ),
    availabilityQuote: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .nullable()
      .describe(
        "For workaround only: exact affirmative wording of resources currently AVAILABLE in the barrier report. If that report says availability is unknown, use null, needs_information, remeasure, one question and no proposedChanges. A closed canteen's earlier menu is not current availability.",
      ),
    primaryResourceQuote: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .nullable()
      .describe(
        "For workaround only: copy ONE interchangeable item exactly from availabilityQuote, such as 豆腐 / tofu. Do not copy the whole menu, venue or completed meal. Use this exact item name in proposedChanges. Otherwise null.",
      ),
    fallbackResourceQuote: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .nullable()
      .describe(
        "For workaround only: copy ONE distinct available item solving the SAME meal/access barrier, such as 煮鸡蛋 / boiled eggs. It must occur verbatim in availabilityQuote and proposedChanges. A family dinner is not a fallback for a closed lunch counter. Never borrow self-packed food from the old AI plan as proof of current availability. Otherwise null.",
      ),
    reviewProposal: CoachRecommendationSchema.shape.proposedChangeSummary
      .unwrap()
      .min(1)
      .nullable(),
  })
  .strict();

/** A numerical review has its own required proposal; it is not an execution workaround with an optional array. */
export function coachAssessmentSchema(repeatedProjectionReview: boolean) {
  return z.discriminatedUnion("numerical", [
    CoachAssessmentSchema.extend({
      numerical: z.literal("review_projection"),
      reviewProposal: CoachAssessmentSchema.shape.reviewProposal
        .unwrap()
        .describe(
          "One concrete calculator/plan-review proposal: which timing, activity willingness or assumption needs review, and which replacement the USER would review and explicitly accept. A future capacity already stated is known, not a missing-answer question. 'Review the plan' alone is insufficient. Keep accepted targets and plan until explicit acceptance; invent no amount, schedule or new date.",
        ),
    }),
    CoachAssessmentSchema.extend({
      numerical: repeatedProjectionReview
        ? z.enum(["confirm_measurement"])
        : z.enum(["continue_plan", "confirm_measurement", "withhold"]),
      reviewProposal: z.null(),
    }),
  ]);
}

const ObservationEvidenceSchema = z
  .object({
    inputHash: z.string(),
    weight: ForecastSnapshotSchema.shape.weightErrors,
    bodyFat: ForecastSnapshotSchema.shape.bodyFatErrors,
  })
  .strict();

/** Missing older evidence stays unavailable. Never compare an observation to a future endpoint or a fitted point. */
export function checkInReasoning(
  r: StageRequest,
  sources: Record<string, string>,
) {
  let observations: z.infer<typeof ObservationEvidenceSchema> | null = null;
  if (sources.forecast) {
    const envelope = JSON.parse(sources.forecast) as { observations?: unknown };
    if (envelope.observations !== undefined) {
      observations = ObservationEvidenceSchema.parse(envelope.observations);
      if (observations.inputHash !== r.calculation?.forecastInputHash)
        throw new Error(
          "Observation residuals belong to a different calculator input.",
        );
      for (const e of observations.weight) {
        const report = r.measurements.find((m) => m.date === e.date);
        if (
          e.date > r.binding.asOfDate ||
          report?.weightKg !== e.actualKg ||
          Math.abs(e.actualKg - e.predictedKg - e.residualKg) > 1e-8
        )
          throw new Error(
            "A same-day weight residual must match an included dated measurement.",
          );
      }
      for (const e of observations.bodyFat) {
        const report = r.measurements.find((m) => m.date === e.date);
        if (
          e.date > r.binding.asOfDate ||
          report?.bodyFat?.percent !== e.actualPct ||
          report.bodyFat.method !== e.method ||
          Math.abs(e.actualPct - e.predictedPct - e.residualPct) > 1e-8
        )
          throw new Error(
            "A same-day body-fat residual must match an included dated measurement and method.",
          );
      }
    }
  }
  const c = r.comparison;
  const reports = r.measurements.filter(
    (m) => m.weightKg !== null || m.bodyFat !== null,
  );
  return {
    version: CHECK_IN_CONTEXT_VERSION,
    asOfDate: r.binding.asOfDate,
    reportedMeasurements: reports.map(({ date, weightKg, bodyFat }) => ({
      date,
      weightKg,
      bodyFat,
    })),
    latestRecord: r.measurements.at(-1)
      ? {
          date: r.measurements.at(-1)!.date,
          containsReportedWeight: r.measurements.at(-1)!.weightKg !== null,
          containsReportedBodyFat: r.measurements.at(-1)!.bodyFat !== null,
        }
      : null,
    sameDayObservationResiduals: observations
      ? {
          kind: "hall_pre_update_residual" as const,
          weight: observations.weight,
          bodyFat: observations.bodyFat,
          meaning:
            "Reported value minus Hall's prediction on that measurement's date BEFORE incorporating that observation; not a future forecast change or a measured cause.",
        }
      : null,
    futureProjectionComparison: c
      ? {
          kind: "common_date_future_projection" as const,
          date: c.date,
          goalReachedAtComparisonDate: pointMeetsGoal(c.updated, r.goal),
          reference: c.reference,
          updated: c.updated,
          previousReview: c.previous,
          changesFromReference: {
            weightKg: c.updated.weightKg - c.reference.weightKg,
            bodyFatPp:
              c.updated.bodyFatPct !== null && c.reference.bodyFatPct !== null
                ? c.updated.bodyFatPct - c.reference.bodyFatPct
                : null,
            arrivalDays:
              c.reference.arrivalDate && c.updated.arrivalDate
                ? daysBetween(c.reference.arrivalDate, c.updated.arrivalDate)
                : null,
          },
          reviewReasons: c.reasons,
          datedHistoryEvidence: c.evidence,
          reviewReasonMeaning: c.reasons.some((reason) =>
            [
              "weight_projection_changed",
              "body_fat_projection_changed",
              "arrival_changed",
              "goal_no_longer_reached",
            ].includes(reason),
          )
            ? "The existing review policy flagged a change in conditional forecasts on this common future date. This flag is not the size or cause of the latest same-day residual."
            : c.reasons.length
              ? "The existing review reason concerns method/scope confirmation, independently of endpoint change."
              : "No existing numerical review reason is present; a manual review can still concern practical context.",
          meaning:
            "Difference between conditional model projections on this one future date; never an actual reading or a same-day observation residual.",
        }
      : null,
    historyCoverage: r.historyCoverage,
    interpretationLimit:
      "Multiple dates show persistence only. Check conditions and body-fat methods before calling readings comparable; no intake, metabolism, adherence or tissue-change diagnosis.",
  };
}

/** Expose dated meaning and existing policy decisions, not amounts for the model to recalculate or copy into prose. */
export function checkInModelContext(e: ReturnType<typeof checkInReasoning>) {
  const direction = (n: number | null) =>
    n === null ? null : n > 0 ? "higher" : n < 0 ? "lower" : "unchanged";
  const future = e.futureProjectionComparison;
  return {
    version: e.version,
    asOfDate: e.asOfDate,
    latestRecord: e.latestRecord,
    reportedMeasurements: e.reportedMeasurements.map((m) => ({
      date: m.date,
      reportedWeight: m.weightKg !== null,
      bodyFatMethod: m.bodyFat?.method ?? null,
    })),
    futureProjectionComparison: future
      ? {
          kind: future.kind,
          date: future.date,
          goalReachedAtComparisonDate: future.goalReachedAtComparisonDate,
          weightDirectionFromReference: direction(
            future.changesFromReference.weightKg,
          ),
          bodyFatDirectionFromReference: direction(
            future.changesFromReference.bodyFatPp,
          ),
          reviewReasons: future.reviewReasons,
          datedHistoryEvidence: future.datedHistoryEvidence,
          reviewReasonMeaning: future.reviewReasonMeaning,
          meaning: future.meaning,
        }
      : null,
    sameDayObservationResiduals: e.sameDayObservationResiduals
      ? {
          kind: e.sameDayObservationResiduals.kind,
          weight: e.sameDayObservationResiduals.weight.map((v) => ({
            date: v.date,
            directionFromPriorPrediction: direction(v.residualKg),
          })),
          bodyFat: e.sameDayObservationResiduals.bodyFat.map((v) => ({
            date: v.date,
            method: v.method,
            directionFromPriorPrediction: direction(v.residualPct),
          })),
          meaning: e.sameDayObservationResiduals.meaning,
        }
      : null,
    historyCoverage: e.historyCoverage,
    interpretationLimit: e.interpretationLimit,
    numericalAuthority:
      "Amounts and exact source quotes remain in the calculator display and canonical receipt. No calibrated noise range or cause is supplied.",
  };
}

/** One translation from the model's independent choices to the existing public decision enum. */
export function coachRecommendation(
  assessment: z.infer<typeof CoachAssessmentSchema>,
): z.infer<typeof CoachRecommendationSchema>["recommendation"] {
  if (
    assessment.numerical === "withhold" ||
    assessment.practical === "withhold"
  )
    return "pause";
  if (assessment.practical === "needs_information") return "remeasure";
  if (assessment.numerical === "review_projection") return "revise_plan";
  if (assessment.practical === "workaround") return "adjust_execution";
  return assessment.numerical === "confirm_measurement"
    ? "remeasure"
    : "keep_plan";
}

/** Enforce independent decisions; these checks do not certify that model-written alternatives are useful. */
export function coachAssessmentIssues(
  assessment: z.infer<typeof CoachAssessmentSchema>,
  v: z.infer<typeof CoachRecommendationSchema>,
  reports: { evidenceId: string; quote: string }[],
): string[] {
  const issues: string[] = [];
  if (
    [assessment.practical, assessment.numerical].includes("withhold") &&
    v.interpretation !== "scope_concern"
  )
    issues.push(
      "Withhold/pause is for a supported scope concern. Unknown causes or repeated ordinary measurements call for a focused check or a proposed calculator review, not an unexplained pause.",
    );
  if (
    ["workaround", "needs_information"].includes(assessment.practical) &&
    (!assessment.barrierQuote ||
      !reports.some((r) => r.quote.includes(assessment.barrierQuote!)))
  )
    issues.push(
      "assessment.barrierQuote must quote the CURRENT difficulty exactly from a selected user report, not a positive update or an accepted-plan hypothetical.",
    );
  if (
    assessment.practical === "workaround" &&
    (!assessment.availabilityQuote ||
      !reports.some(
        (r) =>
          r.quote.includes(assessment.barrierQuote ?? "\u0000") &&
          r.quote.includes(assessment.availabilityQuote!),
      ) ||
      /不知道|不清楚|未知|别假设|unknown|not sure|do not assume|don't know/i.test(
        assessment.availabilityQuote,
      ))
  )
    issues.push(
      "A workaround needs affirmative availabilityQuote from the same current barrier report. If no usable option is reported, use needs_information + remeasure, one access question, and empty proposedChanges; do not invent supplies, storage or preparation.",
    );
  if (assessment.practical !== "workaround" && assessment.availabilityQuote)
    issues.push(
      "Use null availabilityQuote when no current available workaround is established.",
    );
  if (assessment.practical === "workaround") {
    const resources = [
      assessment.primaryResourceQuote,
      assessment.fallbackResourceQuote,
    ];
    if (
      resources.some(
        (quote) =>
          !quote ||
          !assessment.availabilityQuote?.includes(quote) ||
          !v.proposedChangeSummary?.includes(quote),
      ) ||
      assessment.primaryResourceQuote === assessment.fallbackResourceQuote
    )
      issues.push(
        "A workaround needs distinct primaryResourceQuote and fallbackResourceQuote copied exactly from availabilityQuote, both used in proposedChanges. If the primary is out, use the named known fallback; never replace it with an unreported resource or another speculative fallback.",
      );
    for (const field of [
      "primaryResourceQuote",
      "fallbackResourceQuote",
    ] as const) {
      const quote = assessment[field];
      if (!quote || !assessment.availabilityQuote?.includes(quote))
        issues.push(
          `assessment.${field}: ${JSON.stringify(quote)} is not one verbatim available item in availabilityQuote ${JSON.stringify(assessment.availabilityQuote)}. Select a short item name from that report; do not add a venue prefix, whole-menu bundle or another meal.`,
        );
      if (quote && !v.proposedChangeSummary?.includes(quote))
        issues.push(
          `proposedChanges: include the exact selected ${field} ${JSON.stringify(quote)} in its primary/fallback step, or reselect the actual item. Current text does not contain it verbatim.`,
        );
    }
  } else if (
    assessment.primaryResourceQuote ||
    assessment.fallbackResourceQuote
  ) {
    issues.push(
      "Use null primaryResourceQuote and fallbackResourceQuote when no current workaround is proposed.",
    );
  }
  if (assessment.practical === "no_new_obstacle" && assessment.barrierQuote)
    issues.push(
      "A quiet update has no current barrierQuote; use null and keep the workable plan.",
    );
  if (
    assessment.practical === "no_new_obstacle" &&
    assessment.numerical !== "review_projection" &&
    v.proposedChangeSummary
  )
    issues.push(
      "Restating the accepted routine is not a proposed change. Use no proposedChanges for a quiet update.",
    );
  if (
    assessment.practical === "workaround" &&
    ((assessment.numerical === "review_projection"
      ? v.recommendation !== "revise_plan"
      : v.recommendation !== "adjust_execution") ||
      !v.proposedChangeSummary)
  )
    issues.push(
      "A practical workaround uses adjust_execution with an obstacle-matched primary and fallback, even when numerical targets stay unchanged.",
    );
  if (
    assessment.practical === "needs_information" &&
    (v.recommendation !== "remeasure" || !v.question || v.proposedChangeSummary)
  )
    issues.push(
      "Unknown access needs remeasure with one key question and no invented alternative.",
    );
  if (
    assessment.practical === "needs_information" &&
    /例如|比如|（如|\(如|如食堂|如便利店|such as|e\.g\.|for example/i.test(
      v.question ?? "",
    )
  )
    issues.push(
      "Ask one plain access question without listing speculative food, equipment, storage, delivery or colleague-sharing examples. The user has not reported those resources. Do not turn the question into a list of suggested workarounds.",
    );
  if (
    v.recommendation === "adjust_execution" &&
    assessment.practical !== "workaround"
  )
    issues.push(
      "adjust_execution needs an independently assessed practical workaround.",
    );
  if (
    assessment.practical === "workaround" &&
    !["execution_gap_possible", "assumptions_changed"].includes(
      v.interpretation,
    )
  )
    issues.push(
      "A reported execution workaround needs an execution/assumption interpretation, not only a temporary-noise explanation.",
    );
  if (
    v.recommendation === "revise_plan" &&
    assessment.numerical !== "review_projection"
  )
    issues.push(
      "A numerical revision needs explicit discussion of calculator assumptions and user acceptance.",
    );
  if (
    assessment.numerical === "review_projection" &&
    v.recommendation !== "revise_plan"
  )
    issues.push(
      "Use revise_plan for a proposed calculator review, without applying a target change.",
    );
  if (
    assessment.practical === "no_new_obstacle" &&
    assessment.numerical === "confirm_measurement" &&
    v.recommendation !== "remeasure"
  )
    issues.push(
      "Remeasurement without a separate workaround uses remeasure, not a generic keep conclusion.",
    );
  if (
    [assessment.practical, assessment.numerical].includes("withhold") &&
    !["pause", "remeasure"].includes(v.recommendation)
  )
    issues.push("Withheld guidance cannot contain a practical loss proposal.");
  return issues;
}
