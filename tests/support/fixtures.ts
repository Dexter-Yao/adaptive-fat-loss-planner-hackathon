// ABOUTME: Canonical fictional v4 requests plus raw retired fixtures exclusively for migration tests.
import raw from "../fixtures/audit-cases.json";
import {
  CoachRequestSchema,
  addDays,
  DailyObservationSchema,
  type CoachRequest,
} from "../../src/domain/contracts";
import { exampleRequest } from "../../src/domain/example";
export function requestAt(day = 14): CoachRequest {
  const r = exampleRequest("2026-06-15");
  r.asOfDate = addDays(r.profile.startDate, day);
  r.logs = [];
  r.targetRevisions = [
    {
      effectiveFrom: r.profile.startDate,
      dailyCalories: 1850,
      targetDate: r.goal.requestedDate!,
      mode: "loss",
      goalId: r.goal.id,
    },
  ];
  return CoachRequestSchema.parse(r);
}
export function observation(
  date: string,
  values: Record<string, unknown> = {},
) {
  return DailyObservationSchema.parse({
    date,
    weightKg: null,
    bodyFat: null,
    intake: null,
    activity: null,
    steps: null,
    notes: "",
    ...values,
  });
}
export function retiredExample(today = "2026-10-28") {
  return {
    version: 3,
    profile: {
      ...raw.cases[0].request.profile,
      startDate: addDays(today, -14),
      targetDate: addDays(today, 70),
    },
    logs: [
      {
        date: today,
        weightKg: 71.6,
        intakeKcal: 2100,
        activity: "low",
        notes: "A fictional legacy entry.",
      },
    ],
    isExample: true,
  };
}
