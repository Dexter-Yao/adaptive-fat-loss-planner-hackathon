// ABOUTME: Cross-worktree acceptance boundaries for complete journey proposals and bounded review.
// ABOUTME: Tests reject missing checkpoints, invented source support, excessive effort and automatic fourth revisions.
import assert from "node:assert/strict";
import test from "node:test";
import {
  JourneyContentSchema,
  JourneyBindingSchema,
  JourneyFeedbackSchema,
  CoachRecommendationSchema,
  journeyContentIssues,
  nextFeedbackRevision,
} from "../src/domain/journey";
import { addDays } from "../src/domain/facts";

export function journeyFixture() {
  const binding = JourneyBindingSchema.parse({
    sessionId: "fictional-journey",
    sourceRevision: 2,
    forecastInputHash: "a".repeat(64),
    targetScheduleHash: "b".repeat(64),
    startsOn: "2026-10-28",
    endsOn: "2026-11-12",
  });
  const sources = {
    routine: "I buy lunch outside and can train twice a week.",
  };
  const content = JourneyContentSchema.parse({
    headline: "A plan for bought lunches",
    summary: "Use repeatable lunches and review progress weekly.",
    whyForYou: [
      {
        sourceId: "routine",
        quote: "buy lunch outside",
        reason: "Choose meals that can be bought near work.",
      },
    ],
    phases: [
      {
        label: "A workable routine",
        startsOn: binding.startsOn,
        endsOn: binding.endsOn,
        focus: "Keep the routine practical.",
      },
    ],
    weeks: ["2026-10-26", "2026-11-02", "2026-11-09"].map((weekStart, i) => ({
      weekStart,
      focus: "Use repeatable bought meals.",
      actions: [
        {
          key: "lunch-" + i,
          kind: "nutrition",
          title: "Choose a lunch option before the queue",
          details:
            "Choose rice, chicken or tofu and vegetables from an available shop.",
          dates: [i === 0 ? binding.startsOn : weekStart],
          fallback: "Use a known supermarket meal if the shop is closed.",
          successCheck: "You chose an available option before ordering.",
          plannedMinutes: null,
        },
      ],
      checkIn: {
        date: i === 2 ? binding.endsOn : addDays(weekStart, 6),
        label: "Your weekly check-in",
      },
    })),
    reviewApproach:
      "Update a measurement at each check-in; review a meaningful forecast change before changing the plan.",
  });
  return { binding, sources, content };
}
test("a complete journey includes partial boundary weeks and source-backed personalization", () => {
  const f = journeyFixture();
  assert.deepEqual(
    journeyContentIssues(f.content, f.binding, f.sources, 120),
    [],
  );
});
test("a four-week display window cannot truncate the complete goal journey", () => {
  const f = journeyFixture();
  f.content.weeks.pop();
  assert.match(
    journeyContentIssues(f.content, f.binding, f.sources, 120).join(),
    /every calendar week/,
  );
});
test("the final partial week cannot put its checkpoint after the journey end", () => {
  const f = journeyFixture();
  f.content.weeks[2].checkIn.date = "2026-11-15";
  assert.match(
    journeyContentIssues(f.content, f.binding, f.sources, 120).join(),
    /active dates/,
  );
});
test("unsupported personalization and conflicting week ownership fail validation", () => {
  const f = journeyFixture();
  f.content.whyForYou[0].quote = "I cook every meal";
  f.content.weeks[1].weekStart = f.content.weeks[0].weekStart;
  const errors = journeyContentIssues(f.content, f.binding, f.sources, 120);
  assert.match(errors.join(), /exact supplied/);
  assert.match(errors.join(), /every calendar week/);
});
test("fallbacks cannot be empty and model-written metadata is rejected", () => {
  const f = journeyFixture();
  f.content.weeks[0].actions[0].fallback = "";
  assert.equal(JourneyContentSchema.safeParse(f.content).success, false);
  assert.equal(
    JourneyContentSchema.safeParse({
      ...journeyFixture().content,
      sessionId: "invented",
    }).success,
    false,
  );
});
test("a correct copied numerical target still cannot create a second prose owner", () => {
  const f = journeyFixture();
  f.content.summary = "Follow 2,350 kcal and reach 81 kg.";
  assert.match(
    journeyContentIssues(f.content, f.binding, f.sources, 120).join(),
    /deterministic display/,
  );
});
test("planned exercise counts each scheduled date against the user's stated budget", () => {
  const f = journeyFixture();
  f.content.weeks[0].actions.push({
    key: "walk",
    kind: "movement",
    title: "Walk at lunch",
    details: "Walk at a comfortable pace.",
    dates: ["2026-10-29", "2026-10-30"],
    fallback: "Use the indoor option.",
    successCheck: "You used the scheduled time.",
    plannedMinutes: 30,
  });
  assert.match(
    journeyContentIssues(f.content, f.binding, f.sources, 45).join(),
    /time budget/,
  );
});
test("initial generation permits exactly three user feedback revisions", () => {
  assert.equal(
    nextFeedbackRevision(nextFeedbackRevision(nextFeedbackRevision(0))),
    3,
  );
  assert.throws(() => nextFeedbackRevision(3), /no automatic acceptance/);
});
test("feedback is bound to a draft and cannot supply unbounded values or target overrides", () => {
  const f = {
    draftId: "draft-1",
    sourceRevision: 2,
    priorities: ["less_time"],
    availableTrainingMinutes: 60,
    requestedGoalDate: null,
    notes: "Keep lunch simple.",
  };
  assert.equal(JourneyFeedbackSchema.safeParse(f).success, true);
  assert.equal(
    JourneyFeedbackSchema.safeParse({ ...f, availableTrainingMinutes: 2000 })
      .success,
    false,
  );
  assert.equal(
    JourneyFeedbackSchema.safeParse({ ...f, dailyCalories: 500 }).success,
    false,
  );
});
test("coach interpretation distinguishes a possible temporary change from an accepted revision", () => {
  const r = {
    interpretation: "temporary_possible",
    recommendation: "remeasure",
    summary: "One measurement differs.",
    evidence: [
      {
        sourceId: "check-in",
        quote: "After travel",
        reason: "The timing may matter.",
      },
    ],
    uncertainty: "The cause cannot be established from this reading.",
    question: null,
    proposedChangeSummary: null,
  };
  assert.equal(CoachRecommendationSchema.safeParse(r).success, true);
  assert.equal(
    CoachRecommendationSchema.safeParse({ ...r, recommendation: "revise_plan" })
      .success,
    false,
  );
});
