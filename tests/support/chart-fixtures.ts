// ABOUTME: Explicit fictional chart scenarios use real calculation/controller and scripted, labelled plan content.
// ABOUTME: The typed A-summary fixture is only for B's isolated tests/preview; never a product fallback selector.
import { addDays, defaultPreferences } from "../../src/domain/facts";
import { ForecastSnapshotSchema } from "../../src/domain/forecast";
import type { GoalSummaryView } from "../../src/application/goal-progress-contract";
import { selectJourney } from "../../src/application/journey-selectors";
import { selectJourneyChartInput } from "../../src/application/journey-chart-view";
import { fictionalInput, journeyHarness } from "./journey-fixtures";
export const CHART_DATE = "2026-10-15";
export async function chartFixture(days = 28, bodyFatOnly = false) {
  const h = journeyHarness(),
    input = fictionalInput();
  input.profile.startDate = CHART_DATE;
  input.profile.timezone = "Asia/Bangkok";
  if (bodyFatOnly) input.profile.bodyFat = null;
  input.goal.requestedDate = addDays(CHART_DATE, days);
  input.preferences = {
    ...defaultPreferences(CHART_DATE),
    foodPreferences: input.preferences.foodPreferences,
    context: input.preferences.context,
  };
  h.setToday(CHART_DATE);
  await h.controller.start(input, true);
  const staged = structuredClone(h.state);
  const draft = staged.journey.drafts.at(-1)!;
  if (days >= 14) {
    const split = Math.floor(days / 3);
    draft.content.phases = [
      {
        startsOn: CHART_DATE,
        endsOn: addDays(CHART_DATE, split - 1),
        label: "Establish a workable routine",
        focus:
          "Fictional preview: choose a repeatable option that fits the stated context.",
      },
      {
        startsOn: addDays(CHART_DATE, split),
        endsOn: addDays(CHART_DATE, split * 2 - 1),
        label: "Keep the routine steady",
        focus:
          "Fictional preview: keep the useful routine and review the planned measurement.",
      },
      {
        startsOn: addDays(CHART_DATE, split * 2),
        endsOn: draft.binding.endsOn,
        label: "Review the next steps",
        focus: "Fictional preview: discuss what to keep at the final check-in.",
      },
    ];
  }
  h.replace(staged);
  await h.controller.accept();
  const measuredDay = addDays(CHART_DATE, Math.min(7, days - 1));
  h.setToday(measuredDay);
  await h.controller.updateMeasurement({
    date: measuredDay,
    weightKg: bodyFatOnly ? null : 71.5,
    bodyFat: bodyFatOnly ? { percent: 31.5, method: "bia" } : null,
    notes: "Explicit fictional chart test measurement.",
  });
  const plan = selectJourney(h.state, measuredDay).plan!;
  // This fixture supplies the declared contract, not A's real selector or a success assessment.
  const summary: GoalSummaryView = {
    goal: h.state.goal,
    period: {
      startsOn: CHART_DATE,
      endsOn: plan.endsOn,
      endSource: "user_requested",
      durationDays: days,
    },
    activePlanPeriod: { startsOn: plan.startsOn, endsOn: plan.endsOn },
  };
  return {
    h,
    summary,
    today: measuredDay,
    input: selectJourneyChartInput(h.state, measuredDay, summary)!,
  };
}
export async function chartPreviewCases() {
  const short = await chartFixture(),
    long = await chartFixture(365),
    fat = await chartFixture(28, true),
    tiny = await chartFixture(7);
  const failed = structuredClone(short.input),
    comparisonsFailed = structuredClone(short.input),
    missing = structuredClone(short.input),
    stale = structuredClone(short.input);
  const model = failed.forecast!.modelResults.find((m) => m.id === "thomas")!;
  model.status = "failed";
  model.error =
    "Simulated Thomas calculation failure for the isolated UI test.";
  model.current = [];
  model.accepted = [];
  model.sensitivity = { lower: [], upper: [] };
  failed.forecast = ForecastSnapshotSchema.parse(failed.forecast);
  for (const model of comparisonsFailed.forecast!.modelResults.filter(
    (model) => model.id !== "hall",
  )) {
    model.status = "failed";
    model.error = `Simulated ${model.id} failure for the isolated UI test.`;
    model.current = [];
    model.accepted = [];
    model.sensitivity = { lower: [], upper: [] };
  }
  comparisonsFailed.forecast = ForecastSnapshotSchema.parse(
    comparisonsFailed.forecast,
  );
  missing.forecast = null;
  missing.freshness = "unavailable";
  stale.freshness = "stale";
  return {
    short: short.input,
    long: long.input,
    "body-fat-only": fat.input,
    "model-failure": failed,
    "multiple-failures": comparisonsFailed,
    "forecast-unavailable": missing,
    stale,
    tiny: tiny.input,
  };
}
