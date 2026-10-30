// ABOUTME: One typed request/stream contract for the Agent and its browser client.
// ABOUTME: Explanations and suggested actions reference authoritative facts rather than replace them.
import { z } from "zod";
import { ForecastSnapshotSchema } from "./forecast";
import {
  addDays,
  daysBetween,
  DateSchema,
  ProfileFactsSchema,
  GoalSpecSchema,
  PlanningPreferencesSchema,
  dateInZone,
  DailyObservationSchema,
  TargetRevisionSchema,
} from "./facts";
import {
  ContextAssessmentSchema,
  DecisionSchema,
  NumbersSchema,
} from "./analysis";
import {
  WeeklyActionPlanSchema,
  WeekDraftSchema,
  ActionChangeSchema,
} from "./actions";

export const CoachExplanationSchema = z
  .object({
    headline: z.string().min(1).max(100),
    summary: z.string().min(1).max(650),
    changes: z.array(z.string().min(1).max(260)).max(3),
    question: z.string().max(300).nullable(),
    whyForecast: z.string().min(1).max(1000),
  })
  .strict();
export type CoachExplanation = z.infer<typeof CoachExplanationSchema>;
export const PlanPresentationSchema = z
  .object({
    explanation: CoachExplanationSchema,
    newWeeks: z.array(WeekDraftSchema).max(4),
    actionChanges: z.array(ActionChangeSchema).max(20),
  })
  .strict();
export type PlanPresentation = z.infer<typeof PlanPresentationSchema>;
export const CoachRequestSchema = z
  .object({
    sessionId: z.string().min(1).max(100).default("standalone"),
    sourceRevision: z.number().int().nonnegative().default(0),
    actionsRevision: z.number().int().nonnegative().default(0),
    action: z.enum(["create", "update", "accept", "extend", "explain"]),
    profile: ProfileFactsSchema,
    goal: GoalSpecSchema,
    preferences: PlanningPreferencesSchema,
    logs: z.array(DailyObservationSchema).max(366),
    previousExplanation: CoachExplanationSchema.nullable().default(null),
    asOfDate: DateSchema.optional(),
    targetRevisions: z.array(TargetRevisionSchema).max(30).default([]),
    weeklyPlans: z.array(WeeklyActionPlanSchema).max(60).default([]),
    acceptProposalId: z.string().max(100).nullable().default(null),
    previousNumbers: NumbersSchema.nullable().default(null),
  })
  .strict()
  .superRefine((r, ctx) => {
    const asOf = r.asOfDate ?? dateInZone(r.profile.timezone);
    const dates = r.logs.map((log) => log.date);
    if (
      r.preferences.mealSchedules[0].effectiveFrom !== r.profile.startDate ||
      r.preferences.mealSchedules.some(
        (s) => s.effectiveFrom > addDays(asOf, 1),
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["preferences", "mealSchedules"],
        message:
          "Eating patterns start at the baseline and cannot be future-dated.",
      });
    if (r.targetRevisions.some((t) => t.goalId !== r.goal.id))
      ctx.addIssue({
        code: "custom",
        path: ["targetRevisions"],
        message: "Accepted targets must reference this goal.",
      });
    for (const log of r.logs) {
      const schedule = [...r.preferences.mealSchedules]
        .reverse()
        .find((s) => s.effectiveFrom <= log.date);
      if (
        log.intake?.mode === "meals" &&
        log.intake.entries.some(
          (e) => !schedule?.slots.some((s) => s.id === e.slotId),
        )
      )
        ctx.addIssue({
          code: "custom",
          path: ["logs"],
          message: "A meal entry must belong to that date's eating pattern.",
        });
    }
    if (new Set(dates).size !== dates.length)
      ctx.addIssue({
        code: "custom",
        path: ["logs"],
        message: "Correct an existing date instead of adding it twice.",
      });
    if (r.logs.some((log) => log.date < r.profile.startDate || log.date > asOf))
      ctx.addIssue({
        code: "custom",
        path: ["logs"],
        message:
          "Daily records must be between the starting date and the as-of date.",
      });
    if (asOf < r.profile.startDate)
      ctx.addIssue({
        code: "custom",
        path: ["asOfDate"],
        message: "The as-of date must not precede the baseline.",
      });
    if (r.asOfDate && r.asOfDate > addDays(dateInZone(r.profile.timezone), 1))
      ctx.addIssue({
        code: "custom",
        path: ["asOfDate"],
        message: "Future measurements cannot be used in this forecast.",
      });
    if (
      r.targetRevisions.length &&
      r.targetRevisions[0].effectiveFrom !== r.profile.startDate
    )
      ctx.addIssue({
        code: "custom",
        path: ["targetRevisions"],
        message: "Target history must begin at the original baseline.",
      });
    r.targetRevisions.forEach((target, i) => {
      if (
        target.effectiveFrom > addDays(asOf, 1) ||
        target.targetDate <= target.effectiveFrom ||
        daysBetween(r.profile.startDate, target.targetDate) > 365 ||
        (i > 0 &&
          target.effectiveFrom <= r.targetRevisions[i - 1].effectiveFrom)
      )
        ctx.addIssue({
          code: "custom",
          path: ["targetRevisions", i],
          message:
            "Target revisions need ordered effective dates and a future target within the model horizon.",
        });
    });
    if (r.action === "accept" && !r.acceptProposalId)
      ctx.addIssue({
        code: "custom",
        path: ["acceptProposalId"],
        message: "Choose a current proposal to accept.",
      });
    if (
      new Set(r.weeklyPlans.map((week) => week.weekStart)).size !==
        r.weeklyPlans.length ||
      new Set(
        r.weeklyPlans.flatMap((week) => week.actions.map((item) => item.id)),
      ).size !== r.weeklyPlans.flatMap((week) => week.actions).length
    )
      ctx.addIssue({
        code: "custom",
        path: ["weeklyPlans"],
        message: "Weeks and action IDs must be unique.",
      });
  });
export type CoachRequest = z.infer<typeof CoachRequestSchema>;
export type CoachInput = z.input<typeof CoachRequestSchema>;
export const PlanningSnapshotSchema = z.object({
  sourceRevision: z.number().int().nonnegative(),
  asOfDate: DateSchema,
  forecast: ForecastSnapshotSchema.nullable(),
  decision: DecisionSchema,
  context: ContextAssessmentSchema,
  explanation: CoachExplanationSchema.nullable(),
  provider: z.enum(["codex", "nebius"]).nullable(),
  model: z.string().nullable(),
  toolCalls: z.array(z.string()),
});
export type PlanningSnapshot = z.infer<typeof PlanningSnapshotSchema>;
export const CoachResultSchema = PlanningSnapshotSchema.extend({
  sessionId: z.string(),
  actionsRevision: z.number().int().nonnegative(),
  targetRevisions: z.array(TargetRevisionSchema),
  newWeeks: z.array(WeekDraftSchema).max(4),
  actionChanges: z.array(ActionChangeSchema).max(20),
});
export type CoachResult = z.infer<typeof CoachResultSchema>;
export const CoachEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("tool"),
      name: z.enum(["review_context", "forecast", "present_plan"]),
    })
    .strict(),
  z.object({ type: z.literal("done"), result: CoachResultSchema }).strict(),
  z.object({ type: z.literal("error"), message: z.string() }).strict(),
]);
export type CoachEvent = z.infer<typeof CoachEventSchema>;
export const ForecastResponseSchema = PlanningSnapshotSchema.extend({
  sessionId: z.string(),
  targetRevisions: z.array(TargetRevisionSchema),
});
export type ForecastResponse = z.infer<typeof ForecastResponseSchema>;
