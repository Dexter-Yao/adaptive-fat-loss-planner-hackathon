// ABOUTME: One current session key and a version-dispatched, readback-verified migration boundary.
// ABOUTME: Retired fields are parsed only here; historical evidence never becomes new diary facts.
import { z } from "zod";
import { SessionSchema, createSession, type Session } from "./session";
import { emptyJourneyFlow } from "../domain/workflow";
import {
  DateSchema,
  defaultPreferences,
  type ProfileFacts,
  type DailyObservation,
  type GoalSpec,
} from "../domain/facts";
export const SESSION_KEY = "adaptive.session";
export const RETIRED_SESSION_KEY = "adaptive-fat-loss-session-v1";
export const BACKUP_SESSION_KEY = "adaptive.migration-backup";
export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export function persistSession(
  storage: SessionStorage,
  session: Session,
  expected?: Session | null,
): void {
  if (expected) {
    const current = storage.getItem(SESSION_KEY);
    if (
      !current ||
      JSON.stringify(SessionSchema.parse(JSON.parse(current))) !==
        JSON.stringify(SessionSchema.parse(expected))
    )
      throw new Error(
        "Another tab changed this session. Reopen before saving; your editor is retained.",
      );
  } else if (
    expected === null &&
    (storage.getItem(SESSION_KEY) || storage.getItem(RETIRED_SESSION_KEY))
  )
    throw new Error(
      "Existing data is preserved. Clear explicitly before replacing it.",
    );
  const text = JSON.stringify(SessionSchema.parse(session));
  storage.setItem(SESSION_KEY, text);
  if (storage.getItem(SESSION_KEY) !== text)
    throw new Error(
      "The browser could not verify the saved records. Keep the editor open and retry.",
    );
}
const RetiredProfile = z.object({
  ageYears: z.number(),
  sex: z.enum(["male", "female"]),
  heightCm: z.number(),
  weightKg: z.number(),
  startDate: DateSchema,
  targetDate: DateSchema,
  targetWeightKg: z.number(),
  activity: z.enum(["low", "light", "moderate", "high"]),
  preferences: z.string(),
  context: z.string(),
  eligibility: z
    .enum(["standard", "pregnant_or_breastfeeding", "clinical_guidance"])
    .default("standard"),
});
const RetiredLog = z.object({
  date: DateSchema,
  weightKg: z.number().nullable(),
  intakeKcal: z.number().nullable(),
  activity: z.enum(["low", "light", "moderate", "high"]).nullable(),
  notes: z.string(),
});
const Retired = z.object({
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  profile: RetiredProfile,
  logs: z.array(RetiredLog),
  isExample: z.boolean().default(false),
  id: z.string().optional(),
  sourceRevision: z.number().optional(),
  actionsRevision: z.number().optional(),
  targetRevisions: z
    .array(
      z.object({
        effectiveFrom: DateSchema,
        dailyCalories: z.number(),
        targetDate: DateSchema,
        mode: z.enum(["loss", "maintenance"]),
      }),
    )
    .optional(),
  weeklyPlans: z.unknown().optional(),
  snapshot: z.unknown().optional(),
  result: z.unknown().optional(),
});
/** Translate only factual fields from supported retired data; never split a complete total into meals. */
export function migrateSession(text: string): Session {
  const raw: unknown = JSON.parse(text),
    current = SessionSchema.safeParse(raw);
  if (current.success) return current.data;
  if (
    typeof raw === "object" &&
    raw !== null &&
    "version" in raw &&
    raw.version === 5
  )
    return SessionSchema.parse({ ...raw, version: 6 });
  if (
    typeof raw === "object" &&
    raw !== null &&
    "version" in raw &&
    raw.version === 4
  )
    return SessionSchema.parse({
      ...raw,
      version: 6,
      journey: emptyJourneyFlow(),
    });
  const old = Retired.parse(raw),
    p = old.profile;
  const levels = {
    low: "very_light",
    light: "moderate",
    moderate: "active",
    high: "very_active",
  } as const;
  const profile: ProfileFacts = {
    ageYears: p.ageYears,
    sex: p.sex,
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    startDate: p.startDate,
    bodyFat: null,
    eligibility: p.eligibility,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    activity: {
      work: "very_light",
      leisure: levels[p.activity],
      routines: [],
      source: "migrated",
      migratedPal: { low: 1.4, light: 1.6, moderate: 1.8, high: 2 }[p.activity],
    },
  };
  const goal: GoalSpec = {
    id: "migrated-goal",
    kind: "weight",
    value: p.targetWeightKg,
    requestedDate: p.targetDate,
  };
  const preferences = {
    ...defaultPreferences(p.startDate),
    foodPreferences: p.preferences,
    context: p.context,
  };
  const logs: DailyObservation[] = old.logs.map((l) => ({
    date: l.date,
    weightKg: l.weightKg,
    bodyFat: null,
    intake:
      l.intakeKcal === null
        ? null
        : { mode: "daily_total", kcal: l.intakeKcal },
    activity: null,
    steps: null,
    notes:
      l.notes +
      (l.activity
        ? `\nHistorical activity category: ${l.activity}; no exercise duration was recorded.`
        : ""),
  }));
  const session = createSession(
    profile,
    goal,
    preferences,
    logs,
    old.isExample,
  );
  const result = old.result as
    | { acceptedPlans?: unknown; targetRevisions?: unknown }
    | undefined;
  const targets =
    old.targetRevisions ??
    result?.targetRevisions ??
    result?.acceptedPlans ??
    [];
  if (!Array.isArray(targets))
    throw new Error(
      "Saved target history needs review; the original data is preserved.",
    );
  return SessionSchema.parse({
    ...session,
    id: old.id ?? session.id,
    sourceRevision: old.sourceRevision ?? 0,
    actionsRevision: old.actionsRevision ?? 0,
    targetRevisions: targets.map((t) => ({ ...t, goalId: goal.id })),
    weeklyPlans: old.weeklyPlans ?? [],
    historicalAnalysis: old.snapshot ?? old.result ?? null,
  });
}
export function loadSession(storage: SessionStorage): {
  session: Session | null;
  notice: string | null;
} {
  const active = storage.getItem(SESSION_KEY),
    retired = storage.getItem(RETIRED_SESSION_KEY),
    text = active ?? retired;
  if (!text) return { session: null, notice: null };
  const raw: unknown = JSON.parse(text);
  const valid = SessionSchema.safeParse(raw);
  if (valid.success) {
    return {
      session: valid.data,
      notice:
        valid.data.journey.task?.status === "running"
          ? "An unfinished request is recorded. Retry here or wait for the other tab; your facts remain saved."
          : null,
    };
  }
  const session = migrateSession(text);
  storage.setItem(BACKUP_SESSION_KEY, text);
  if (storage.getItem(BACKUP_SESSION_KEY) !== text)
    throw new Error(
      "The migration backup could not be verified. Existing data is unchanged.",
    );
  if (storage.getItem(active ? SESSION_KEY : RETIRED_SESSION_KEY) !== text)
    throw new Error(
      "Another tab changed the source during migration. Reopen before saving.",
    );
  persistSession(storage, session);
  if (retired && !active) storage.removeItem(RETIRED_SESSION_KEY);
  return {
    session,
    notice:
      typeof raw === "object" &&
      raw !== null &&
      "version" in raw &&
      raw.version === 5
        ? "Your saved plan and records were preserved. Replanning history is now supported."
        : "Your records, target history and edited arrangements were preserved. Recalculate to use the three-model analysis.",
  };
}
export function clearSession(storage: SessionStorage): void {
  storage.removeItem(BACKUP_SESSION_KEY);
  storage.removeItem(SESSION_KEY);
  storage.removeItem(RETIRED_SESSION_KEY);
}
