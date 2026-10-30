// ABOUTME: The six fictional journey inputs and provisional review criteria have one source.
// ABOUTME: This preparation layer cannot authorize inference, manufacture expected outputs or own user facts.
import { z } from "zod";
import data from "./journey-cases.json";
import { InitializationInputSchema } from "../domain/initialization";
import { MeasurementUpdateSchema } from "../domain/workflow";
import { RevisionIntentSchema } from "../domain/journey";
import { DateSchema } from "../domain/facts";
import { PLAN_DIMENSIONS } from "../domain/plan-quality";
const rubric = PLAN_DIMENSIONS.map(
  ({ id, titleZh, questionZh, failureZh }) => ({
    id,
    titleZh,
    questionZh,
    failureZh,
  }),
);

const CriterionSchema = z
  .object({
    id: z.string().min(1),
    titleZh: z.string().min(1),
    questionZh: z.string().min(1),
    failureZh: z.string().min(1),
  })
  .strict();
export const ReviewJourneySchema = z
  .object({
    id: z.string().regex(/^J0[1-6]$/),
    titleZh: z.string().min(1),
    sourceIds: z.array(z.string().regex(/^S0[1-8]$/)).min(1),
    cycleZh: z.string().min(1),
    lifeZh: z.string().min(1),
    effortZh: z.string().min(1),
    initialInput: InitializationInputSchema,
    initialFeedback: RevisionIntentSchema,
    feedbackZh: z.string().min(1),
    focusZh: z.string().min(1),
    criteria: z.array(z.string()).min(1),
    checkIns: z
      .array(
        z
          .object({
            measurement: MeasurementUpdateSchema,
            detailZh: z.string().min(1),
            reviewMode: z.enum(["if_eligible", "manual"]),
            feedback: RevisionIntentSchema.nullable(),
            proposalDecision: z.enum([
              "none",
              "review_only",
              "decline_until_reviewed",
            ]),
          })
          .strict(),
      )
      .min(6),
  })
  .strict()
  .superRefine((c, ctx) => {
    let previous = c.initialInput.profile.startDate;
    for (const [i, e] of c.checkIns.entries()) {
      if (e.measurement.date <= previous)
        ctx.addIssue({
          code: "custom",
          path: ["checkIns", i],
          message:
            "Check-ins must follow the baseline in strictly increasing date order.",
        });
      if (
        e.measurement.weightKg === null &&
        e.measurement.bodyFat === null &&
        !e.measurement.notes.trim()
      )
        ctx.addIssue({
          code: "custom",
          path: ["checkIns", i],
          message:
            "A check-in needs a measurement or a meaningful context note.",
        });
      previous = e.measurement.date;
    }
  });
export const ReviewSuiteSchema = z
  .object({
    version: z.string().min(1),
    status: z.literal("cases_approved"),
    dataClass: z.literal("fictional"),
    inputLanguage: z.literal("en"),
    purposeZh: z.string(),
    provenanceZh: z.string(),
    scopeZh: z.string(),
    timeZh: z.string(),
    commonReviewQuestionsZh: z.array(z.string()).min(1),
    sources: z.record(z.string(), z.url()),
    rubric: z.array(CriterionSchema).length(4).default(rubric),
    cases: z.array(ReviewJourneySchema).length(6),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (JSON.stringify(s.rubric) !== JSON.stringify(rubric))
      ctx.addIssue({
        code: "custom",
        message:
          "Plan criteria derive from domain/plan-quality.ts; do not redefine them in the case bank.",
      });
    if (new Set(s.cases.map((c) => c.id)).size !== s.cases.length)
      ctx.addIssue({ code: "custom", message: "Journey IDs must be unique." });
    if (new Set(s.rubric.map((c) => c.id)).size !== s.rubric.length)
      ctx.addIssue({
        code: "custom",
        message: "Criterion IDs must be unique.",
      });
    for (const c of s.cases) {
      if (
        c.sourceIds.some((id) => !s.sources[id]) ||
        c.criteria.some((id) => !s.rubric.some((r) => r.id === id))
      )
        ctx.addIssue({
          code: "custom",
          message: `${c.id}: unknown source or review criterion.`,
        });
    }
  });
export type ReviewSuite = z.infer<typeof ReviewSuiteSchema>;
export type ReviewJourney = z.infer<typeof ReviewJourneySchema>;
export const reviewSuite = ReviewSuiteSchema.parse(data);

/** Bind one review to its historical input prefix. Later observations are never model context. */
export function journeyPrefix(
  c: ReviewJourney,
  asOf: string,
  phase: "setup" | "initial_revision" | "follow_up" = "setup",
) {
  DateSchema.parse(asOf);
  if (asOf < c.initialInput.profile.startDate)
    throw Error("The prefix precedes the baseline.");
  return {
    caseId: c.id,
    initialInput: structuredClone(c.initialInput),
    initialFeedback:
      phase === "setup" ? null : structuredClone(c.initialFeedback),
    checkIns:
      phase === "follow_up"
        ? structuredClone(c.checkIns.filter((e) => e.measurement.date <= asOf))
        : [],
  };
}
