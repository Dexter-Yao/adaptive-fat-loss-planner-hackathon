// ABOUTME: Model-facing source views derived from A's canonical request; no persistence or numerical simulation.
// ABOUTME: Historical note sources are context-only views and never fabricated measurements or calculator inputs.
import { CoachRequestSchema } from "../domain/coach";
import { enforceContext, getContextSources } from "../domain/context";
import type { StageRequest } from "../domain/workflow";
export function stageFactRequest(r: StageRequest) {
  const logs = [...r.measurements];
  for (const [id, text] of Object.entries(r.sources))
    if (
      /^log:\d{4}-\d{2}-\d{2}$/.test(id) &&
      !logs.some((l) => l.date === id.slice(4))
    )
      logs.push({
        date: id.slice(4),
        weightKg: null,
        bodyFat: null,
        intake: null,
        activity: null,
        steps: null,
        notes: text,
      });
  logs.sort((a, b) => a.date.localeCompare(b.date));
  return CoachRequestSchema.parse({
    sessionId: r.binding.sessionId,
    sourceRevision: r.binding.sourceRevision,
    asOfDate: r.binding.asOfDate,
    actionsRevision: r.binding.actionsRevision,
    action: "explain",
    profile: r.profile,
    goal: r.goal,
    preferences: r.preferences,
    logs,
    targetRevisions: r.calculation?.proposedTargets ?? [],
    weeklyPlans: r.weeklyPlans,
  });
}
export function stageConstraints(r: StageRequest) {
  return enforceContext(stageFactRequest(r), r.calculation?.context);
}
/** Known source aliases must agree with facts; quoted feedback remains user-provided data. */
export function checkedStageSources(r: StageRequest): Record<string, string> {
  const canonical: Record<string, string> = {
    ...Object.fromEntries(
      getContextSources(stageFactRequest(r)).map((s) => [s.id, s.text]),
    ),
    preferences: r.preferences.foodPreferences,
    context: r.preferences.context,
    work: r.profile.activity.work,
    leisure: r.profile.activity.leisure,
    routines: JSON.stringify(r.profile.activity.routines),
    bodyFat: JSON.stringify(r.profile.bodyFat),
    ...(r.revisionIntent
      ? { revisionIntent: JSON.stringify(r.revisionIntent) }
      : {}),
  };
  for (const [id, text] of Object.entries(canonical))
    if (r.sources[id] !== undefined && r.sources[id] !== text)
      throw new Error(
        "Stage source text differs from the supplied facts: " + id,
      );
  return { ...r.sources, ...canonical };
}
