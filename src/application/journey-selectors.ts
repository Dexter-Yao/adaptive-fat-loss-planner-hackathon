// ABOUTME: B/C's read-only view of workflow, proposal, week/day actions and measurement-based progress.
// ABOUTME: Views derive from the single session; no second action calendar, accepted target or forecast store exists.
import type { Session } from "./session";
import { activeAcceptance, pendingDraft } from "./journey-commands";
import { startOfWeek, targetOnDate } from "../domain/facts";
import { guidanceContextReviewed } from "./check-in-freshness";
import { MAX_FEEDBACK_REVISIONS } from "../domain/journey";

export type JourneyPhase =
  | "setup"
  | "clarification"
  | "interpreting"
  | "calculating"
  | "generating"
  | "revising"
  | "reviewing_progress"
  | "accepting"
  | "review"
  | "feedback_limit"
  | "active"
  | "blocked"
  | "recovery";
export function selectJourney(s: Session, today: string, requestLive = false) {
  const flow = s.journey,
    accepted = activeAcceptance(s),
    draft = pendingDraft(s),
    task = flow.task,
    calc = flow.calculation,
    feedback = flow.feedback.find((f) => f.draftId === draft?.id),
    snapshot = s.snapshot,
    blocked = Boolean(
      (calc && !calc.snapshot.forecast) ||
        ["paused", "needs_confirmation"].includes(
          (calc?.snapshot ?? snapshot)?.decision.status ?? "",
        ),
    ),
    stale = Boolean(
      draft &&
        (draft.binding.sourceRevision !== s.sourceRevision ||
          draft.binding.actionsRevision !== s.actionsRevision ||
          draft.binding.startsOn !== today),
    );
  let phase: JourneyPhase = accepted ? "active" : "setup";
  if (draft)
    phase =
      draft.feedbackRevision === MAX_FEEDBACK_REVISIONS && feedback
        ? "feedback_limit"
        : "review";
  if (s.initializationReview?.interpretation?.clarification && !accepted)
    phase = "clarification";
  if (blocked) phase = "blocked";
  if (task)
    phase =
      task.status !== "running" || !requestLive
        ? "recovery"
        : (
            {
              interpret: "interpreting",
              calculate: "calculating",
              generate: "generating",
              revise: "revising",
              review_progress: "reviewing_progress",
              accept: "accepting",
            } as const
          )[task.stage];
  const activeDraft = accepted
      ? (flow.drafts.find((d) => d.id === accepted.draftId) ?? null)
      : null,
    review = flow.reviews.at(-1),
    reviewCurrent = Boolean(
      review &&
        !review.dismissed &&
        review.binding.sessionId === s.id &&
        review.binding.sourceRevision === s.sourceRevision &&
        review.binding.actionsRevision === s.actionsRevision &&
        review.binding.asOfDate === today &&
        review.binding.acceptedJourneyId === accepted?.id,
    ),
    numbersFresh = Boolean(
      snapshot &&
        snapshot.sourceRevision === s.sourceRevision &&
        snapshot.asOfDate === today,
    ),
    guidanceWithheld =
      !numbersFresh ||
      ["paused", "needs_confirmation"].includes(
        snapshot?.decision.status ?? "",
      ) ||
      snapshot?.decision.code === "goal_reached";
  return {
    phase,
    error: task?.error ?? null,
    retryable: phase === "recovery",
    hasAcceptedJourney: Boolean(accepted),
    proposal: draft
      ? {
          draft,
          stale,
          feedbackRevisionsRemaining: Math.max(
            0,
            MAX_FEEDBACK_REVISIONS - draft.feedbackRevision,
          ),
          canAccept: !stale && !blocked && !feedback,
          calculation: calc,
        }
      : null,
    plan: activeDraft
      ? {
          id: accepted!.id,
          headline: activeDraft.content.headline,
          summary: activeDraft.content.summary,
          phases: activeDraft.content.phases,
          whyForYou: activeDraft.content.whyForYou,
          startsOn: activeDraft.binding.startsOn,
          endsOn: activeDraft.binding.endsOn,
          weeks: s.weeklyPlans,
          adviceFresh:
            numbersFresh && !guidanceWithheld && guidanceContextReviewed(s),
        }
      : null,
    currentWeek:
      s.weeklyPlans.find((w) => w.weekStart === startOfWeek(today)) ?? null,
    nextCheckIn:
      s.weeklyPlans
        .flatMap((w) => (w.checkIn ? [w.checkIn] : []))
        .filter((c) => c.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null,
    target:
      accepted && !guidanceWithheld
        ? targetOnDate(s.targetRevisions, today)
        : null,
    progress: {
      snapshot,
      numbersFresh,
      guidanceWithheld,
      reference: accepted?.reference ?? null,
      history: flow.forecastHistory,
      measurements: s.logs,
      assessments: flow.assessments,
    },
    coach: review ? { ...review, current: reviewCurrent } : null,
  };
}
export function selectJourneyDay(s: Session, date: string, today: string) {
  const week = s.weeklyPlans.find((w) => w.weekStart === startOfWeek(date));
  const withheld = selectJourney(s, today).progress.guidanceWithheld;
  return {
    date,
    target: withheld ? null : targetOnDate(s.targetRevisions, date),
    guidanceWithheld: withheld,
    actions: week?.actions.filter((a) => a.dates.includes(date)) ?? [],
    checkIn: week?.checkIn?.date === date ? week.checkIn : null,
    record: s.logs.find((l) => l.date === date) ?? null,
  };
}
