// ABOUTME: Fictional stage fixtures are built through A's real calculation and canonical request projections.
// ABOUTME: These people are not Dexter; generated numbers come only from the shared calculator.
import { exampleRequest } from "../../src/domain/example";
import { CoachRequestSchema } from "../../src/domain/coach";
import { createSession } from "../../src/application/session";
import {
  enableJourney,
  newBinding,
  buildCalculationRequest,
  receiveCalculation,
  buildStageRequest,
} from "../../src/application/journey-commands";
import { calculateJourney } from "../../src/planning/journey-calculation";
import { generationInput } from "../../src/agent/stage-router";
import type { JourneyAgentInput } from "../../src/agent/journey-content";
import { UNMET_GOAL_NOTICE } from "../../src/planning/journey-feasibility";
import { pointMeetsGoal } from "../../src/planning/goal-policy";
import type { JourneyContent } from "../../src/domain/journey";
import { startOfWeek, addDays } from "../../src/domain/facts";

export const STAGE_FIXTURE_DATE = "2026-10-01";
export function journeyStageFixture(
  days = 21,
  food = "No seafood. I can buy rice, chicken, tofu and eggs.",
  goalKg = 81,
) {
  const request = CoachRequestSchema.parse(exampleRequest(STAGE_FIXTURE_DATE));
  request.profile = {
    ...request.profile,
    ageYears: 36,
    sex: "male",
    heightCm: 175,
    weightKg: 82,
    startDate: STAGE_FIXTURE_DATE,
    bodyFat: { percent: 27, method: "dxa" },
    activity: {
      work: "very_light",
      leisure: "light",
      routines: [],
      source: "questionnaire",
      migratedPal: null,
    },
  };
  request.goal = {
    id: "fictional-stage-goal",
    kind: "weight",
    value: goalKg,
    requestedDate: addDays(request.profile.startDate, days),
  };
  request.preferences = {
    ...request.preferences,
    foodPreferences: food,
    context:
      "I work at a desk, buy lunch outside, and have no kitchen. I can plan two short walks in a week.",
    cooking: "mostly_out",
    availableTrainingMinutes: 60,
    mealSchedules: request.preferences.mealSchedules.map((s) => ({
      ...s,
      effectiveFrom: request.profile.startDate,
    })),
  };
  let session = enableJourney(
    createSession(request.profile, request.goal, request.preferences, [], true),
  );
  const calculation = calculateJourney(
    buildCalculationRequest(
      session,
      newBinding(session, STAGE_FIXTURE_DATE),
      true,
    ),
  );
  session = receiveCalculation(session, calculation, true);
  const stage = buildStageRequest(
    session,
    newBinding(session, STAGE_FIXTURE_DATE),
    "generate",
  );
  return {
    session,
    request: stage,
    input: {
      profile: request.profile,
      goal: request.goal,
      preferences: request.preferences,
    },
  };
}
export function journeyAgentFixture(
  days = 21,
  food?: string,
): JourneyAgentInput {
  return generationInput(journeyStageFixture(days, food).request);
}

/** A clearly synthetic valid proposal for harness tests, never a successful provider fallback. */
export function syntheticJourney(input: JourneyAgentInput): JourneyContent {
  const weeks = [];
  for (
    let d = startOfWeek(input.binding.startsOn);
    d <= input.binding.endsOn;
    d = addDays(d, 7)
  ) {
    const first = d < input.binding.startsOn ? input.binding.startsOn : d;
    const last =
      addDays(d, 6) > input.binding.endsOn
        ? input.binding.endsOn
        : addDays(d, 6);
    weeks.push({
      weekStart: d,
      focus: "Use a workable bought lunch.",
      actions: [
        {
          key: "w" + d.replaceAll("-", "") + "-nutrition-1",
          kind: "nutrition" as const,
          title: "Choose lunch before ordering",
          details:
            "At the lunch shop, ask for chicken and vegetables with sauce separately if available.",
          dates: [first],
          fallback:
            "If unavailable, choose a ready-to-eat tofu and vegetable option from a shop.",
          successCheck: "You chose an available option before ordering.",
          plannedMinutes: null,
        },
      ],
      checkIn: { date: first, label: "Your weekly check-in" },
    });
  }
  const entry =
    Object.entries(input.sources).find(([id]) => id.includes("preferences")) ??
    Object.entries(input.sources)[0];
  const end = input.calculation.models.find((m) => m.id === "hall")?.endpoint;
  const summary =
    end && !pointMeetsGoal(end, input.goal)
      ? UNMET_GOAL_NOTICE
      : "Repeat an available lunch option and check progress weekly.";
  return {
    headline: "A workable lunch routine",
    summary,
    whyForYou: [
      {
        sourceId: entry[0],
        quote: entry[1],
        reason: "Choose options consistent with your food preferences.",
      },
    ],
    phases: [
      {
        label: "Practice and review",
        startsOn: input.binding.startsOn,
        endsOn: input.binding.endsOn,
        focus: "Use repeatable choices and a weekly measurement.",
        guidance: {
          version: "phase-guidance-v1",
          objective: "Make a repeatable lunch decision.",
          commitments: [
            "Before ordering, ask for an available chicken and vegetable lunch.",
          ],
          obstacles: [
            {
              barrier: "If the usual option is unavailable.",
              alternative:
                "Choose ready-to-eat tofu and vegetables if offered.",
            },
          ],
          checkInQuestions: ["Did the lunch choice fit your routine?"],
          progression: {
            keepWhen: "Keep the choice if it remains workable.",
            discussChangeWhen:
              "If access changes, discuss another available lunch option.",
          },
          evidence: [
            {
              sourceId: entry[0],
              quote: entry[1],
              reason:
                "Use choices consistent with the supplied food preferences.",
            },
          ],
        },
      },
    ],
    weeks,
    reviewApproach:
      "Review measurements before changing targets; one reading cannot establish the cause.",
  };
}

/** Preserve coverage of the model allocation path when movement choices remain ambiguous. */
export function syntheticMovementJourney(
  input: JourneyAgentInput,
): JourneyContent {
  const content = syntheticJourney(input);
  for (const week of content.weeks) {
    const action = week.actions[0];
    Object.assign(action, {
      key: action.key.replace("nutrition", "movement"),
      kind: "movement",
      title: "Use an available walk",
      details: "After work, walk along a familiar available route.",
      fallback:
        "If the route is unavailable, discuss an accessible alternative.",
      successCheck: "The chosen route fitted the available time.",
      plannedMinutes: 30,
    });
  }
  return content;
}

/** Explicit synthetic provider payload for the internal weekly tool, not a canonical saved plan. */
export function syntheticGuidanceWeeks(weeks: JourneyContent["weeks"]) {
  return weeks.map((w) => ({
    focus: w.focus,
    checkInLabel: w.checkIn.label,
    actions: w.actions.map((a) => ({
      kind: a.kind,
      title: a.title,
      details: a.details,
      fallback: a.fallback,
      successCheck: a.successCheck,
      activityOptionIds:
        a.kind === "movement" ? [`m${a.plannedMinutes}x${a.dates.length}`] : [],
    })),
  }));
}
export function syntheticGuidanceContent(content: JourneyContent) {
  const ref = (e: JourneyContent["whyForYou"][number]) => ({
    sourceRef: e.sourceId + "#1",
    reason: e.reason,
  });
  return {
    ...content,
    goalStatus: content.summary.includes(UNMET_GOAL_NOTICE)
      ? "projected_unmet"
      : "projected_reached",
    whyForYou: content.whyForYou.map(ref),
    phases: content.phases.map((p) => ({
      ...p,
      guidance: p.guidance
        ? { ...p.guidance, evidence: p.guidance.evidence.map(ref) }
        : undefined,
    })),
    weeks: syntheticGuidanceWeeks(content.weeks),
  };
}
