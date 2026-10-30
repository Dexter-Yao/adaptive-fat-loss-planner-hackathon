// ABOUTME: Shared next-flow contracts for generated journey proposals, bounded feedback and coach decisions.
// ABOUTME: These are proposal boundaries; accepted facts, targets and completed actions keep their existing owners.
import { z } from "zod";
import {
  addDays,
  DateSchema,
  startOfWeek,
  TrainingMinutesSchema,
} from "./facts";
import { numericalProseIssues } from "./numeric-copy";
import { SourceReasonSchema } from "./source-evidence";
import { PhaseGuidanceSchema, phaseGuidanceFields } from "./phase-guidance";

export const JOURNEY_CONTRACT_VERSION =
  "adaptive-journey-2026-10-29-phase-guidance";
export const MAX_FEEDBACK_REVISIONS = 3;
export const MAX_WEEKLY_ACTIONS = 5;
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const TextSchema = z.string().trim().min(1).max(500);
export { SourceReasonSchema } from "./source-evidence";

export const JourneyActionDraftSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_-]{0,59}$/),
    kind: z.enum(["nutrition", "movement"]),
    title: z.string().trim().min(1).max(90),
    details: TextSchema,
    dates: z.array(DateSchema).min(1).max(7),
    fallback: TextSchema,
    successCheck: TextSchema,
    plannedMinutes: z.number().int().min(1).max(240).nullable(),
  })
  .strict()
  .superRefine((a, c) => {
    if (new Set(a.dates).size !== a.dates.length)
      c.addIssue({ code: "custom", message: "Choose each action date once." });
    if ((a.kind === "nutrition") !== (a.plannedMinutes === null))
      c.addIssue({
        code: "custom",
        message:
          "Movement needs a time budget; nutrition has no training minutes.",
      });
  });
export const JourneyWeekDraftSchema = z
  .object({
    weekStart: DateSchema,
    focus: z.string().trim().min(1).max(180),
    actions: z.array(JourneyActionDraftSchema).min(1).max(MAX_WEEKLY_ACTIONS),
    checkIn: z
      .object({
        date: DateSchema,
        label: z.string().trim().min(1).max(90),
      })
      .strict(),
  })
  .strict();

/** Model-written content only; session/version bindings are applied by application code. */
export const JourneyContentSchema = z
  .object({
    headline: z.string().trim().min(1).max(120),
    summary: TextSchema,
    whyForYou: z.array(SourceReasonSchema).min(1).max(5),
    phases: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(90),
            startsOn: DateSchema,
            endsOn: DateSchema,
            focus: TextSchema,
            guidance: PhaseGuidanceSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    weeks: z.array(JourneyWeekDraftSchema).min(1).max(54),
    reviewApproach: TextSchema,
  })
  .strict();
export type JourneyContent = z.infer<typeof JourneyContentSchema>;
export const JourneyBindingSchema = z
  .object({
    sessionId: z.string().min(1),
    sourceRevision: z.number().int().nonnegative(),
    actionsRevision: z.number().int().nonnegative().default(0),
    forecastInputHash: HashSchema,
    targetScheduleHash: HashSchema,
    startsOn: DateSchema,
    endsOn: DateSchema,
  })
  .strict()
  .superRefine((b, c) => {
    if (b.endsOn < b.startsOn || b.endsOn > addDays(b.startsOn, 365))
      c.addIssue({
        code: "custom",
        message:
          "A journey uses the calculator-approved horizon, at most 365 days.",
      });
  });
export type JourneyBinding = z.infer<typeof JourneyBindingSchema>;
export const JourneyDraftSchema = z
  .object({
    revisionIntent: z
      .lazy(() => RevisionIntentSchema)
      .nullable()
      .optional(),
    id: z.string().min(1),
    binding: JourneyBindingSchema,
    feedbackRevision: z.number().int().min(0).max(MAX_FEEDBACK_REVISIONS),
    content: JourneyContentSchema,
  })
  .strict();
export type JourneyDraft = z.infer<typeof JourneyDraftSchema>;

export const JourneyFeedbackSchema = z
  .object({
    draftId: z.string().min(1),
    sourceRevision: z.number().int().nonnegative(),
    priorities: z
      .array(
        z.enum([
          "less_time",
          "fewer_actions",
          "food_flexibility",
          "different_activity",
          "later_goal_date",
          "other",
        ]),
      )
      .min(1)
      .max(6),
    availableTrainingMinutes: TrainingMinutesSchema.nullable(),
    requestedGoalDate: DateSchema.nullable(),
    notes: z.string().trim().max(1500),
  })
  .strict();
export type JourneyFeedback = z.infer<typeof JourneyFeedbackSchema>;

export const RevisionIntentSchema = JourneyFeedbackSchema.omit({
  draftId: true,
  sourceRevision: true,
});
export type RevisionIntent = z.infer<typeof RevisionIntentSchema>;

/** Validate proposal usefulness and ownership against authoritative source context. */
export function journeyContentIssues(
  content: JourneyContent,
  binding: JourneyBinding,
  sources: Record<string, string>,
  availableTrainingMinutes: number,
): string[] {
  const issues: string[] = [];
  const prose = [
    content.headline,
    content.summary,
    content.reviewApproach,
    ...content.whyForYou.map((r) => r.reason),
    ...content.phases.flatMap((p) => [
      p.label,
      p.focus,
      ...(p.guidance ? phaseGuidanceFields(p.guidance).map((f) => f.text) : []),
    ]),
    ...content.weeks.flatMap((w) => [
      w.focus,
      w.checkIn.label,
      ...w.actions.flatMap((a) => [
        a.title,
        a.details,
        a.fallback,
        a.successCheck,
      ]),
    ]),
  ].join("\n");
  issues.push(...numericalProseIssues(prose));
  if (content.whyForYou.some((r) => !sources[r.sourceId]?.includes(r.quote)))
    issues.push("Personalization must cite exact supplied source text.");
  for (const [index, phase] of content.phases.entries())
    if (
      phase.guidance?.evidence.some(
        (e) => !sources[e.sourceId]?.includes(e.quote),
      )
    )
      issues.push(
        `phases.${index}.guidance.evidence: cite exact supplied source text.`,
      );
  const expected: string[] = [];
  for (
    let d = startOfWeek(binding.startsOn);
    d <= binding.endsOn;
    d = addDays(d, 7)
  )
    expected.push(d);
  if (
    content.weeks.length !== expected.length ||
    content.weeks.some((w, i) => w.weekStart !== expected[i])
  )
    issues.push(
      "Include every calendar week once, in order, through the approved journey end.",
    );
  const keys = new Set<string>();
  for (const week of content.weeks) {
    const first =
      week.weekStart > binding.startsOn ? week.weekStart : binding.startsOn;
    const last =
      addDays(week.weekStart, 6) < binding.endsOn
        ? addDays(week.weekStart, 6)
        : binding.endsOn;
    if (week.checkIn.date < first || week.checkIn.date > last)
      issues.push(
        "Each whole or partial journey week needs a check-in within its active dates.",
      );
    let minutes = 0;
    for (const action of week.actions) {
      if (keys.has(action.key))
        issues.push("Action keys must be unique across the proposal.");
      keys.add(action.key);
      if (action.dates.some((d) => d < first || d > last))
        issues.push("Do not invent past or out-of-week actions.");
      minutes += (action.plannedMinutes ?? 0) * action.dates.length;
    }
    if (minutes > availableTrainingMinutes)
      issues.push(
        "The proposed training exceeds the confirmed weekly time budget.",
      );
  }
  if (
    content.phases[0].startsOn !== binding.startsOn ||
    content.phases.at(-1)!.endsOn !== binding.endsOn
  )
    issues.push("Phases must cover the approved journey horizon.");
  for (let i = 0; i < content.phases.length; i++) {
    const p = content.phases[i];
    if (
      p.startsOn > p.endsOn ||
      (i > 0 && p.startsOn !== addDays(content.phases[i - 1].endsOn, 1))
    )
      issues.push(
        `Phases must be ordered, contiguous and non-overlapping. phases.${i}: ${p.startsOn > p.endsOn ? "the start must not follow the end" : `startsOn must be ${addDays(content.phases[i - 1].endsOn, 1)}; phase end dates are inclusive, so adjacent phases cannot share a boundary date`}.`,
      );
  }
  return [...new Set(issues)];
}

/** A user-feedback revision is not a transport repair or an automatic approval. */
export function nextFeedbackRevision(current: number): number {
  if (
    !Number.isInteger(current) ||
    current < 0 ||
    current >= MAX_FEEDBACK_REVISIONS
  )
    throw new Error(
      "The three feedback revisions are used. Keep the draft or edit the initial choices; no automatic acceptance.",
    );
  return current + 1;
}

export const CoachRecommendationSchema = z
  .object({
    interpretation: z.enum([
      "temporary_possible",
      "execution_gap_possible",
      "assumptions_changed",
      "insufficient_evidence",
      "scope_concern",
    ]),
    recommendation: z.enum([
      "keep_plan",
      "remeasure",
      "adjust_execution",
      "revise_plan",
      "pause",
    ]),
    summary: TextSchema,
    evidence: z.array(SourceReasonSchema).min(1).max(6),
    uncertainty: TextSchema,
    question: z.string().trim().min(1).max(240).nullable(),
    proposedChangeSummary: z.string().trim().max(500).nullable(),
  })
  .strict()
  .superRefine((r, c) => {
    if (
      ["adjust_execution", "revise_plan"].includes(r.recommendation) &&
      !r.proposedChangeSummary
    )
      c.addIssue({
        code: "custom",
        message:
          "A proposed revision needs a concrete change summary; it is not already applied.",
      });
  });
