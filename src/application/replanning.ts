// ABOUTME: Replanning prefill and views derive from existing facts, preserving their original measurement date.
// ABOUTME: The candidate has a new identity and no inherited observations; archived cores never recurse.
import { activeAcceptance } from "./journey-commands";
import {
  SessionCoreSchema,
  SessionSchema,
  createSession,
  type Session,
} from "./session";
import type { ReplanningDraftView } from "./replanning-contract";
export function prefillReplanning(s: Session, today: string) {
  const weight = [...s.logs]
    .filter((l) => l.weightKg !== null && l.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  const date = weight?.date ?? s.profile.startDate;
  const bodyFat =
    weight?.bodyFat ??
    (date === s.profile.startDate ? s.profile.bodyFat : null);
  const schedule =
    [...s.preferences.mealSchedules]
      .filter((p) => p.effectiveFrom <= today)
      .at(-1) ?? s.preferences.mealSchedules[0];
  return {
    profile: {
      ...s.profile,
      startDate: date,
      weightKg: weight?.weightKg ?? s.profile.weightKg,
      bodyFat,
    },
    goal: { ...s.goal, id: crypto.randomUUID() },
    preferences: {
      ...s.preferences,
      mealSchedules: [{ ...schedule, effectiveFrom: date }],
    },
  };
}
export function createReplanning(s: Session, today: string): Session {
  const accepted = activeAcceptance(s);
  if (!accepted)
    throw new Error("Accept your first plan before starting a new one.");
  if (s.replanning) return s;
  const input = prefillReplanning(s, today);
  const fresh = createSession(
    input.profile,
    input.goal,
    input.preferences,
    [],
    s.isExample,
  );
  return SessionSchema.parse({
    ...s,
    replanning: {
      id: fresh.id,
      sourceSessionId: s.id,
      sourceRevision: s.sourceRevision,
      sourceActionsRevision: s.actionsRevision,
      sourceAcceptedJourneyId: accepted.id,
      startedOn: today,
      step: "setup",
      candidate: {
        ...SessionCoreSchema.parse(fresh),
        journey: { ...fresh.journey, enabled: true },
      },
    },
  });
}
export function assertReplanningSource(
  s: Session,
): NonNullable<Session["replanning"]> {
  const draft = s.replanning;
  if (!draft) throw new Error("There is no new-plan draft to resume.");
  if (
    draft.sourceSessionId !== s.id ||
    draft.sourceRevision !== s.sourceRevision ||
    draft.sourceActionsRevision !== s.actionsRevision ||
    draft.sourceAcceptedJourneyId !== activeAcceptance(s)?.id
  )
    throw new Error(
      "Your current plan changed after this draft began. Cancel this draft and replan from the updated information.",
    );
  return draft;
}
export function replanningSession(s: Session | null): Session | null {
  return s?.replanning ? SessionSchema.parse(s.replanning.candidate) : null;
}
export function selectReplanning(
  s: Session | null,
  running = false,
): ReplanningDraftView | null {
  const d = s?.replanning;
  if (!d) return null;
  const c = d.candidate,
    task = c.journey.task;
  return {
    id: d.id,
    sourceSessionId: d.sourceSessionId,
    status:
      task?.status === "failed" ||
      task?.status === "interrupted" ||
      (task?.status === "running" && !running)
        ? "failed"
        : task?.status === "running"
          ? "generating"
          : d.step === "setup"
            ? "editing"
            : "review",
    input: structuredClone({
      profile: c.profile,
      goal: c.goal,
      preferences: c.preferences,
    }),
    error:
      task?.error ??
      (task?.status === "running" && !running
        ? "An unfinished new-plan request is saved. Retry when ready."
        : null),
  };
}

/** Historical facts stay read-only and retain their original core identity after promotion. */
export function selectReplanningHistory(s: Session) {
  return [...s.archives].reverse().map((entry) => ({
    ...entry,
    revisions: [...entry.session.journey.acceptances].reverse().map((a) => ({
      ...a,
      draft:
        entry.session.journey.drafts.find((d) => d.id === a.draftId) ?? null,
    })),
  }));
}
