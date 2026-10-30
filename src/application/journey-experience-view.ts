// ABOUTME: Read-only review and check-in presentation derived from the canonical session and workflow projections.
// ABOUTME: No model, target, eligibility or acceptance policy is calculated or stored here.
import type { Session } from "./session";
import type { CheckInExperienceView } from "./journey-experience-contract";
import { selectJourney } from "./journey-selectors";
import { activeAcceptance } from "./journey-commands";
import { targetOnDate } from "../domain/facts";
import { selectMeasurementExperience } from "./measurement-view";
import { journeyFeasibility } from "../planning/journey-feasibility";

/** Distinguishes same-day, identically titled acceptances without creating a second history. */
export function selectAcceptedPlanHistory(s: Session, today: string) {
  const revisions = selectMeasurementExperience(s, today).revisions;
  const currentId = activeAcceptance(s)?.id;
  return revisions.map((revision, index) => ({
    ...revision,
    version: revisions.length - index,
    isCurrent: revision.id === currentId,
  }));
}

export function selectPlanReview(
  s: Session,
  today: string,
  currentSession: Session = s,
) {
  const proposal = selectJourney(s, today).proposal;
  if (!proposal) return null;
  const draft = proposal.draft;
  const accepted = activeAcceptance(currentSession);
  const preceding =
    s.journey.drafts[s.journey.drafts.findIndex((d) => d.id === draft.id) - 1];
  const previous = accepted
    ? (currentSession.journey.drafts.find((d) => d.id === accepted.draftId) ??
      null)
    : draft.feedbackRevision > 0
      ? (preceding ?? null)
      : null;
  const previousFeedback =
    draft.feedbackRevision > 0 && preceding
      ? (s.journey.feedback.findLast((f) => f.draftId === preceding.id) ?? null)
      : null;
  const feedback = draft.revisionIntent ?? previousFeedback;
  const target = proposal.calculation?.proposedTargets.at(-1) ?? null;
  const forecast = proposal.calculation?.snapshot.forecast;
  return {
    draft,
    previous,
    previousLabel: accepted ? "Current accepted plan" : "Previous proposal",
    replacement: Boolean(accepted),
    feedback,
    guidanceChanged: previous
      ? JSON.stringify([
          previous.content.summary,
          previous.content.phases,
          previous.content.weeks,
        ]) !==
        JSON.stringify([
          draft.content.summary,
          draft.content.phases,
          draft.content.weeks,
        ])
      : null,
    currentTarget: accepted
      ? targetOnDate(currentSession.targetRevisions, today)
      : null,
    currentGoal: accepted ? currentSession.goal : null,
    proposedGoal: s.goal,
    proposedTarget: target,
    targetIsAccepted: Boolean(
      target &&
        currentSession.targetRevisions.some(
          (t) => JSON.stringify(t) === JSON.stringify(target),
        ),
    ),
    feasibility: forecast
      ? journeyFeasibility(
          {
            targetDate: forecast.targetDate,
            models: forecast.modelResults.map((m) => ({
              id: m.id,
              status: m.status,
              error: m.error,
              endpoint: m.current.at(-1) ?? null,
            })),
          },
          s.goal,
        )
      : null,
    weeks: previous
      ? draft.content.weeks
          .map((proposed) => ({
            proposed,
            previous:
              previous.content.weeks.find(
                (w) => w.weekStart === proposed.weekStart,
              ) ?? null,
          }))
          .filter(
            ({ previous, proposed }) =>
              JSON.stringify(previous) !== JSON.stringify(proposed),
          )
      : [],
  };
}

/** Current-version status only. A saved note is not a completed model review or a numerical observation. */
export function selectCheckInExperience(
  s: Session,
  today: string,
  live = false,
): CheckInExperienceView {
  const view = selectJourney(s, today, live);
  const latest = s.logs.at(-1) ?? null;
  const review =
    view.coach?.current && view.progress.numbersFresh ? view.coach : null;
  const task = s.journey.task;
  const working = live && task?.status === "running";
  const difference = view.progress.numbersFresh
    ? selectMeasurementExperience(s, today).difference
    : null;
  return {
    latest,
    review,
    numbersFresh: view.progress.numbersFresh,
    forecastAvailable:
      view.progress.numbersFresh && Boolean(s.snapshot?.forecast),
    forecastChange: difference
      ? {
          date: difference.date,
          value:
            s.goal.kind === "weight"
              ? difference.weightKg
              : difference.bodyFatPct,
          unit: s.goal.kind === "weight" ? "kg" : "percentage points",
        }
      : null,
    guidanceFresh: view.plan?.adviceFresh ?? false,
    task:
      task && (task.stage === "calculate" || task.stage === "review_progress")
        ? {
            stage: task.stage,
            working: Boolean(working),
            error: task.error,
          }
        : null,
    canRequestReview:
      view.hasAcceptedJourney &&
      view.progress.numbersFresh &&
      !task &&
      !view.proposal,
  };
}

export type PlanReviewView = NonNullable<ReturnType<typeof selectPlanReview>>;
