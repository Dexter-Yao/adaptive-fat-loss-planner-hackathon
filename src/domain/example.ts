// ABOUTME: Explicitly fictional input for local interaction and provider verification.
import {
  addDays,
  defaultPreferences,
  type DailyObservation,
  type ProfileFacts,
  type GoalSpec,
} from "./facts";
import { CoachRequestSchema } from "./coach";
export function makeExample(today: string) {
  const start = addDays(today, -14);
  const profile: ProfileFacts = {
    ageYears: 34,
    sex: "female",
    heightCm: 165,
    weightKg: 72,
    startDate: start,
    bodyFat: { percent: 32, method: "bia" },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    eligibility: "standard",
    activity: {
      work: "very_light",
      leisure: "moderate",
      routines: [{ kind: "walking", minutes: 30, timesPerWeek: 1 }],
      source: "questionnaire",
      migratedPal: null,
    },
  };
  const goal: GoalSpec = {
    id: "example-goal",
    kind: "weight",
    value: 68,
    requestedDate: addDays(start, 84),
  };
  const preferences = {
    ...defaultPreferences(start),
    foodPreferences:
      "Fictional example. No seafood. I enjoy rice, chicken, tofu and eggs.",
    context:
      "I work at a desk, buy lunch outside, can train twice a week and enjoy dinners with friends.",
  };
  const logs: DailyObservation[] = Array.from({ length: 14 }, (_, i) => ({
    date: addDays(start, i),
    weightKg: i % 2 === 0 ? Math.round((72 - i * 0.035) * 10) / 10 : null,
    bodyFat: null,
    intake:
      i % 4 === 0 ? null : { mode: "daily_total", kcal: 1850 + (i % 3) * 100 },
    activity: null,
    steps: null,
    notes: i === 10 ? "I cannot cook at the moment; I buy my meals." : "",
  }));
  return { profile, goal, preferences, logs };
}
export function exampleRequest(today: string) {
  return CoachRequestSchema.parse({
    action: "update",
    asOfDate: today,
    ...makeExample(today),
  });
}
