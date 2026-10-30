// ABOUTME: Adapt the application's canonical stage port to the four model-facing operations and shared calculator.
// ABOUTME: Check compact calculation/source bindings; The calculator and explicit acceptance own numerical authority.
import { BaselineEstimateSchema } from "../domain/forecast";
import {
  StageCalculationSchema,
  StageRequestSchema,
  StageResponseSchema,
  type StageRequest,
  type StageResponse,
} from "../domain/workflow";
import { estimateBaseline } from "../planning/inputs";
import { assertPlanningEligibility } from "../domain/planning-eligibility";
import { targetScheduleHash } from "../planning/journey-calculation";
import { reviewInitialization } from "./initialize";
import {
  generateJourneyContent,
  type JourneyAgentInput,
} from "./journey-content";
import type { StageOptions } from "./stage-runtime";
import { reviewProgressStage } from "./progress-review";
import type { AgentProvider } from "./session";
import { checkedStageSources, stageConstraints } from "./stage-context";

/** Check the compact calculator projection and exact binding; complete calculation/acceptance remains the application port. */
export function checkedStageCalculation(r: StageRequest) {
  const c = r.calculation;
  if (!c)
    throw new Error(
      "Calculate the current facts before requesting a journey stage.",
    );
  const a = c.binding,
    b = r.binding;
  if (
    a.sessionId !== b.sessionId ||
    a.sourceRevision !== b.sourceRevision ||
    a.actionsRevision !== b.actionsRevision ||
    a.acceptedJourneyId !== b.acceptedJourneyId ||
    a.asOfDate !== b.asOfDate
  )
    throw new Error(
      "The stage calculation belongs to different inputs or an accepted journey.",
    );
  if (targetScheduleHash(c.proposedTargets) !== c.targetScheduleHash)
    throw new Error("The candidate targets do not match their schedule hash.");
  if (
    c.baseline &&
    JSON.stringify(c.baseline) !==
      JSON.stringify(BaselineEstimateSchema.parse(estimateBaseline(r.profile)))
  )
    throw new Error(
      "The baseline projection does not match the supplied physiological facts.",
    );
  return StageCalculationSchema.parse(c);
}

export function generationInput(r: StageRequest): JourneyAgentInput {
  const checked = checkedStageCalculation(r);
  if (!checked.forecastInputHash || !checked.targetDate)
    throw new Error(
      "Resolve the calculator's scope or measurement confirmation before generating a loss journey.",
    );
  return {
    profile: r.profile,
    goal: r.goal,
    preferences: r.preferences,
    binding: {
      sessionId: r.binding.sessionId,
      sourceRevision: r.binding.sourceRevision,
      actionsRevision: r.binding.actionsRevision,
      forecastInputHash: checked.forecastInputHash,
      targetScheduleHash: checked.targetScheduleHash,
      startsOn: r.binding.asOfDate,
      endsOn: checked.targetDate,
    },
    calculation: checked,
    context: stageConstraints(r),
    sources: checkedStageSources(r),
    previousDraft: r.stage === "revise" ? r.previousDraft : null,
    feedback: r.stage === "revise" ? r.feedback : null,
    arrangements: r.weeklyPlans,
    revisionIntent: r.revisionIntent,
    acceptedStrategy: r.acceptedStrategy,
    latestReview: r.latestReview,
    recentUserText: [r.measurements.at(-1)?.notes ?? ""],
  };
}

export async function runModelStage(
  raw: unknown,
  provider: AgentProvider,
  options: StageOptions = {},
): Promise<StageResponse> {
  const r = StageRequestSchema.parse(raw),
    sources = checkedStageSources(r);
  options = { ...options, requestId: r.binding.requestId };
  // A scope-only progress review may still explain why guidance is paused.
  if (r.stage !== "review_progress") assertPlanningEligibility(r.profile);
  if (
    r.historyCoverage.includedRecords !== r.measurements.length ||
    r.historyCoverage.totalRecords < r.measurements.length ||
    r.historyCoverage.firstIncludedDate !== (r.measurements[0]?.date ?? null)
  )
    throw new Error(
      "The declared history coverage does not match the included observations.",
    );
  if (r.stage === "interpret") {
    const result = await reviewInitialization(
      { profile: r.profile, goal: r.goal, preferences: r.preferences },
      provider,
      options.signal,
      options,
    );
    return StageResponseSchema.parse({
      stage: r.stage,
      binding: r.binding,
      result,
    });
  }
  if (r.stage === "review_progress") {
    const checked = r.calculation ? checkedStageCalculation(r) : null;
    return StageResponseSchema.parse({
      stage: r.stage,
      binding: r.binding,
      result: await reviewProgressStage(r, checked, sources, provider, options),
    });
  }
  if (
    r.stage === "revise" &&
    (!r.previousDraft ||
      !r.feedback ||
      r.feedback.draftId !== r.previousDraft.id)
  )
    throw new Error("Revision requires feedback on the exact preceding draft.");
  if (r.stage === "generate" && r.previousDraft)
    throw new Error("Use the revision stage for an existing draft.");
  const result = await generateJourneyContent(
    generationInput(r),
    provider,
    options,
  );
  return StageResponseSchema.parse({
    stage: r.stage,
    binding: r.binding,
    result,
  });
}
