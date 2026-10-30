// ABOUTME: Authoritative user facts, goals, preferences and dated numerical consent.
// ABOUTME: Unknown intake is never zero; estimates and model inputs live outside the diary.
import { z } from "zod";
export const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Enter a valid calendar date.",
  );
export function daysBetween(start: string, end: string): number {
  return Math.round(
    (Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) /
      86400000,
  );
}
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function startOfWeek(date: string): string {
  const day = new Date(date + "T12:00:00Z").getUTCDay();
  return addDays(date, -((day + 6) % 7));
}
export function fourWeekStarts(date: string): string[] {
  return Array.from({ length: 4 }, (_, i) => addDays(startOfWeek(date), i * 7));
}
export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
export function dateInZone(zone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)!.value)
    .join("-");
}
export const WorkLevelSchema = z.enum([
  "very_light",
  "light",
  "moderate",
  "heavy",
]);
export const LeisureLevelSchema = z.enum([
  "very_light",
  "light",
  "moderate",
  "active",
  "very_active",
]);
export const ExerciseKindSchema = z.enum([
  "walking",
  "brisk_walking",
  "running",
  "cycling",
  "strength",
  "muay_thai",
  "swimming",
]);
export const RoutineSchema = z
  .object({
    kind: ExerciseKindSchema,
    minutes: z.number().min(1).max(240),
    timesPerWeek: z.number().min(0).max(14),
  })
  .strict();
export const BodyFatSchema = z
  .object({
    percent: z.number().min(2).max(65),
    method: z.enum(["bia", "dxa", "caliper", "other"]),
  })
  .strict();
export const ProfileFactsSchema = z
  .object({
    ageYears: z.number().int().min(18).max(85),
    sex: z.enum(["female", "male"]),
    heightCm: z.number().min(130).max(220),
    weightKg: z.number().min(40).max(220),
    startDate: DateSchema,
    bodyFat: BodyFatSchema.nullable().default(null),
    activity: z
      .object({
        work: WorkLevelSchema,
        leisure: LeisureLevelSchema,
        routines: z.array(RoutineSchema).max(7),
        source: z.enum(["questionnaire", "migrated"]).default("questionnaire"),
        migratedPal: z.number().min(1.4).max(2.4).nullable().default(null),
      })
      .strict(),
    eligibility: z
      .enum(["standard", "pregnant_or_breastfeeding", "clinical_guidance"])
      .default("standard"),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid time zone."),
  })
  .strict();
export type ProfileFacts = z.infer<typeof ProfileFactsSchema>;
export const GoalSpecSchema = z
  .object({
    id: z.string().min(1).max(100),
    kind: z.enum(["weight", "body_fat"]),
    value: z.number().positive().max(220),
    requestedDate: DateSchema.nullable(),
  })
  .strict();
export type GoalSpec = z.infer<typeof GoalSpecSchema>;
export const MealSlotSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
    label: z.string().min(1).max(40),
    share: z.number().positive().max(1),
  })
  .strict();
export const MealScheduleSchema = z
  .object({
    effectiveFrom: DateSchema,
    slots: z.array(MealSlotSchema).min(1).max(6),
  })
  .strict()
  .superRefine((s, c) => {
    if (
      Math.abs(s.slots.reduce((a, b) => a + b.share, 0) - 1) > 1e-8 ||
      new Set(s.slots.map((x) => x.id)).size !== s.slots.length
    )
      c.addIssue({
        code: "custom",
        message: "Meal shares must total 100% and have unique IDs.",
      });
  });
export const TrainingMinutesSchema = z.number().int().min(0).max(1680);
export const PlanningPreferencesSchema = z
  .object({
    foodPreferences: z.string().max(1500),
    context: z.string().max(1500),
    cooking: z.enum(["mostly_out", "mostly_home", "mixed"]).default("mixed"),
    availableTrainingMinutes: TrainingMinutesSchema.default(120),
    missingMealMultiplier: z
      .union([z.literal(1), z.literal(1.2), z.literal(1.5), z.literal(2)])
      .default(1.2),
    mealSchedules: z.array(MealScheduleSchema).min(1).max(60),
  })
  .strict()
  .superRefine((p, c) => {
    if (
      p.mealSchedules.some(
        (s, i) =>
          i > 0 && s.effectiveFrom <= p.mealSchedules[i - 1].effectiveFrom,
      )
    )
      c.addIssue({
        code: "custom",
        message: "Meal schedules need ordered effective dates.",
      });
  });
export type PlanningPreferences = z.infer<typeof PlanningPreferencesSchema>;
export function mealSlots(
  template: "two" | "three" | "snack",
): z.infer<typeof MealSlotSchema>[] {
  const labels =
    template === "two"
      ? ["Lunch", "Dinner"]
      : template === "snack"
        ? ["Breakfast", "Lunch", "Dinner", "Snack"]
        : ["Breakfast", "Lunch", "Dinner"];
  return labels.map((label) => ({
    id: label.toLowerCase(),
    label,
    share: 1 / labels.length,
  }));
}
export function defaultPreferences(startDate: string): PlanningPreferences {
  return PlanningPreferencesSchema.parse({
    foodPreferences: "",
    context: "",
    mealSchedules: [{ effectiveFrom: startDate, slots: mealSlots("three") }],
  });
}
export const MealEntrySchema = z.discriminatedUnion("status", [
  z
    .object({
      slotId: z.string(),
      status: z.literal("recorded"),
      kcal: z.number().min(0).max(10000),
    })
    .strict(),
  z.object({ slotId: z.string(), status: z.literal("skipped") }).strict(),
  z.object({ slotId: z.string(), status: z.literal("unknown") }).strict(),
]);
export const IntakeRecordSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("daily_total"),
      kcal: z.number().min(0).max(10000),
    })
    .strict(),
  z
    .object({
      mode: z.literal("meals"),
      entries: z.array(MealEntrySchema).max(6),
      extrasKcal: z.number().min(0).max(10000),
    })
    .strict()
    .superRefine((x, c) => {
      if (new Set(x.entries.map((e) => e.slotId)).size !== x.entries.length)
        c.addIssue({ code: "custom", message: "Record each meal once." });
    }),
]);
export const DailyObservationSchema = z
  .object({
    date: DateSchema,
    weightKg: z.number().min(35).max(250).nullable(),
    bodyFat: BodyFatSchema.nullable().default(null),
    intake: IntakeRecordSchema.nullable(),
    activity: z
      .object({
        work: WorkLevelSchema,
        exercises: z
          .array(
            z
              .object({
                kind: ExerciseKindSchema,
                minutes: z.number().min(1).max(240),
              })
              .strict(),
          )
          .max(7),
      })
      .strict()
      .nullable(),
    steps: z.number().int().min(0).max(100000).nullable().default(null),
    notes: z.string().max(1500),
  })
  .strict();
export type DailyObservation = z.infer<typeof DailyObservationSchema>;
export function upsertDailyObservation(
  logs: DailyObservation[],
  entry: DailyObservation,
): DailyObservation[] {
  return [...logs.filter((x) => x.date !== entry.date), entry].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}
export const TargetRevisionSchema = z
  .object({
    effectiveFrom: DateSchema,
    dailyCalories: z.number().int().min(1000).max(6000),
    targetDate: DateSchema,
    mode: z.enum(["loss", "maintenance"]),
    goalId: z.string().min(1),
  })
  .strict();
export type TargetRevision = z.infer<typeof TargetRevisionSchema>;
export function targetOnDate(
  targets: TargetRevision[],
  date: string,
): TargetRevision | null {
  return [...targets].reverse().find((x) => x.effectiveFrom <= date) ?? null;
}
