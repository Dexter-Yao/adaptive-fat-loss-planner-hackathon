// ABOUTME: Source-versioned NIDDK questionnaire mapping and net MET activity differences.
// ABOUTME: Planned capacity and step counts never become observed expenditure.
import type { ProfileFacts, DailyObservation } from "../domain/facts";
import { restingEnergy } from "./hall";
export const ACTIVITY_VERSION = "niddk-pal-2026-10-28+compendium-2024-v1";
export const WORK_LABELS = {
  very_light: "Mostly sitting",
  light: "Some standing and walking",
  moderate: "On your feet most of the day",
  heavy: "Heavy physical work",
} as const;
export const LEISURE_LABELS = {
  very_light: "Almost no activity",
  light: "Occasional gentle activity",
  moderate: "A regular weekly activity",
  active: "Activity several times a week",
  very_active: "Strenuous activity several times a week",
} as const;
const PAL_TABLE = [
  [1.4, 1.5, 1.6, 1.7],
  [1.5, 1.6, 1.7, 1.8],
  [1.6, 1.7, 1.8, 1.9],
  [1.7, 1.8, 1.9, 2.1],
  [1.9, 2, 2.2, 2.3],
];
// Published 2024 Adult Compendium representative activities. Codes and original values are retained.
export const EXERCISES = {
  walking: { label: "Walking, moderate pace", met: 3.8, code: "17190" },
  brisk_walking: { label: "Brisk walking", met: 4.8, code: "17200" },
  running: { label: "Easy running, about 5 mph", met: 8.5, code: "12030" },
  cycling: { label: "Leisure cycling, under 10 mph", met: 4, code: "01010" },
  strength: { label: "General resistance training", met: 3.5, code: "02054" },
  muay_thai: { label: "Martial arts, moderate pace", met: 10.3, code: "15430" },
  swimming: { label: "Slow freestyle swimming", met: 5.8, code: "18240" },
} as const;
export function questionnairePal(
  work: ProfileFacts["activity"]["work"],
  leisure: ProfileFacts["activity"]["leisure"],
): number {
  return PAL_TABLE[Object.keys(LEISURE_LABELS).indexOf(leisure)][
    Object.keys(WORK_LABELS).indexOf(work)
  ];
}
export function baselinePal(p: ProfileFacts): number {
  return p.activity.source === "migrated" && p.activity.migratedPal !== null
    ? p.activity.migratedPal
    : questionnairePal(p.activity.work, p.activity.leisure);
}
export function baselineExercise(p: ProfileFacts): number {
  return p.activity.routines.reduce(
    (sum, r) =>
      sum +
      ((((EXERCISES[r.kind].met - 1) * r.minutes) / 60) * r.timesPerWeek) / 7,
    0,
  );
}
export function activityDelta(
  p: ProfileFacts,
  observation: DailyObservation["activity"],
): number {
  if (!observation) return 0;
  const exercise = observation.exercises.reduce(
    (sum, e) => sum + ((EXERCISES[e.kind].met - 1) * e.minutes) / 60,
    0,
  );
  const workChange =
    ((questionnairePal(observation.work, "very_light") -
      questionnairePal(p.activity.work, "very_light")) *
      0.9 *
      restingEnergy(p)) /
    p.weightKg;
  return workChange + exercise - baselineExercise(p);
}
