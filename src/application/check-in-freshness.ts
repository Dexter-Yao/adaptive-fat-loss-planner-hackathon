// ABOUTME: Derive whether saved practical guidance has reviewed context, separately from a current coach message.
// ABOUTME: Older generic reviews could promote the context marker; ambiguous promotions stay conservative without a storage migration.
import type { Session } from "./session";
import { adviceContextKey } from "./advice-context";

export function guidanceContextReviewed(s: Session): boolean {
  if (s.agentReviewedContextKey !== adviceContextKey(s)) return false;
  const accepted = s.journey.acceptances.at(-1);
  const draft = s.journey.drafts.find((d) => d.id === accepted?.draftId);
  if (!accepted || !draft) return true; // Preserve non-journey callers' existing marker semantics.
  // Session v6 did not record why a marker advanced. With notes present, a
  // later generic keep/remeasure cannot prove the stored plan was adapted.
  // Dismissal does not accept a replacement, so dismissed reviews also count.
  return (
    !s.logs.some((l) => l.notes.trim()) ||
    !s.journey.reviews.some(
      (r) =>
        r.binding.acceptedJourneyId === accepted.id &&
        r.binding.sourceRevision > draft.binding.sourceRevision &&
        ["keep_plan", "remeasure"].includes(r.result.recommendation),
    )
  );
}
