// ABOUTME: Four-week action arrangements and explicit proposed edits; never energy-balance inputs.
// ABOUTME: A recurring weekly action is one fact with explicit dates and separate self-reported checks.
import { z } from "zod";
import { DateSchema, addDays, startOfWeek } from "./facts";

export const ActionKindSchema = z.enum(["nutrition", "movement", "recording"]);
export const ActionDraftSchema = z
  .object({
    kind: ActionKindSchema,
    title: z.string().trim().min(1).max(90),
    details: z.string().trim().max(500),
    fallback: z.string().trim().max(500).optional(),
    successCheck: z.string().trim().max(500).optional(),
    plannedMinutes: z.number().int().min(1).max(240).nullable().optional(),
    originKey: z.string().max(100).optional(),
    dates: z
      .array(DateSchema)
      .min(1)
      .max(7)
      .refine(
        (dates) => new Set(dates).size === dates.length,
        "Choose each date only once.",
      ),
  })
  .strict();
export type ActionDraft = z.infer<typeof ActionDraftSchema>;
export const WeeklyActionSchema = ActionDraftSchema.extend({
  id: z.string().min(1).max(100),
  editedByUser: z.boolean(),
  checks: z
    .array(
      z
        .object({ date: DateSchema, status: z.enum(["done", "skipped"]) })
        .strict(),
    )
    .max(7),
}).superRefine((action, ctx) => {
  if (
    new Set(action.checks.map((check) => check.date)).size !==
      action.checks.length ||
    action.checks.some((check) => !action.dates.includes(check.date))
  )
    ctx.addIssue({
      code: "custom",
      path: ["checks"],
      message: "Completion belongs to a unique scheduled occurrence.",
    });
});
export type WeeklyAction = z.infer<typeof WeeklyActionSchema>;
function checkWeek(
  week: { weekStart: string; actions: { dates: string[] }[] },
  ctx: z.RefinementCtx,
): void {
  if (startOfWeek(week.weekStart) !== week.weekStart)
    ctx.addIssue({
      code: "custom",
      path: ["weekStart"],
      message: "A calendar week starts on Monday.",
    });
  if (
    week.actions.some((action) =>
      action.dates.some(
        (date) => date < week.weekStart || date > addDays(week.weekStart, 6),
      ),
    )
  )
    ctx.addIssue({
      code: "custom",
      path: ["actions"],
      message: "Actions must stay inside their calendar week.",
    });
}
export const WeekDraftSchema = z
  .object({
    weekStart: DateSchema,
    focus: z.string().trim().min(1).max(180),
    actions: z.array(ActionDraftSchema).min(1).max(8),
  })
  .strict()
  .superRefine(checkWeek);
export type WeekDraft = z.infer<typeof WeekDraftSchema>;
export const WeeklyActionPlanSchema = z
  .object({
    checkIn: z
      .object({ date: DateSchema, label: z.string().min(1).max(90) })
      .strict()
      .optional(),
    weekStart: DateSchema,
    focus: z.string().max(180),
    actions: z.array(WeeklyActionSchema).max(50),
  })
  .strict()
  .superRefine(checkWeek);
export type WeeklyActionPlan = z.infer<typeof WeeklyActionPlanSchema>;
export const ActionChangeSchema = z
  .object({
    kind: z.enum(["add", "edit", "remove"]),
    weekStart: DateSchema,
    actionId: z.string().min(1).max(100).nullable(),
    replacement: ActionDraftSchema.nullable(),
    reason: z.string().min(1).max(240),
  })
  .strict()
  .superRefine((change, ctx) => {
    if (
      (change.kind === "add"
        ? change.actionId !== null
        : change.actionId === null) ||
      (change.kind === "remove"
        ? change.replacement !== null
        : change.replacement === null)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Add needs a new action, edit needs an existing action and replacement, remove needs only its existing ID.",
      });
  });
export type ActionChange = z.infer<typeof ActionChangeSchema>;
