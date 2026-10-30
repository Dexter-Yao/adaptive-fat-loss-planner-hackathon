// ABOUTME: Identify practical context that existing AI action advice was actually reviewed against.
// ABOUTME: Numerical diary edits alone do not require another LLM; new notes and constraints do.
import type { Session } from "./session";
export function adviceContextKey(
  s: Pick<Session, "profile" | "goal" | "preferences" | "logs">,
): string {
  return JSON.stringify({
    profile: s.profile,
    goal: s.goal,
    food: s.preferences.foodPreferences,
    context: s.preferences.context,
    cooking: s.preferences.cooking,
    capacity: s.preferences.availableTrainingMinutes,
    notes: s.logs
      .filter((l) => l.notes.trim())
      .map((l) => ({ date: l.date, notes: l.notes }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  });
}
