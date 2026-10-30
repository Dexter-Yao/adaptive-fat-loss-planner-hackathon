// ABOUTME: Read-only measurement journey display; derives values from the authoritative Session.
// ABOUTME: Date-aligned differences are descriptive, never new targets or coach trigger rules.
import { addDays } from "../domain/facts";
import { endpoint, modelResult } from "../domain/forecast";
import { selectJourney } from "./journey-selectors";
import { latestWeight } from "./selectors";
import type { Session } from "./session";
export function selectMeasurementExperience(s: Session, today: string) {
  const view = selectJourney(s, today);
  const forecast = s.snapshot?.forecast ?? null;
  const point = forecast ? endpoint(forecast) : null;
  const referenceModel = view.progress.reference
    ? modelResult(view.progress.reference, "hall")
    : null;
  const reference =
    forecast && referenceModel?.status === "ok"
      ? referenceModel.current.find((p) => p.date === forecast.projectionDate)
      : null;
  const latestFat = [...s.logs].reverse().find((l) => l.bodyFat);
  return {
    latestWeight: latestWeight(s),
    latestFat: latestFat
      ? { ...latestFat.bodyFat!, date: latestFat.date }
      : s.profile.bodyFat
        ? { ...s.profile.bodyFat, date: s.profile.startDate }
        : null,
    endpoint: point,
    proposalEndpoint: view.proposal?.calculation?.snapshot.forecast
      ? endpoint(view.proposal.calculation.snapshot.forecast)
      : null,
    difference:
      point && reference
        ? {
            date: point.date,
            weightKg: point.weightKg - reference.weightKg,
            bodyFatPct:
              point.bodyFatPct != null && reference.bodyFatPct != null
                ? point.bodyFatPct - reference.bodyFatPct
                : null,
          }
        : null,
    phases:
      view.plan?.phases.map((phase, index) => ({
        ...phase,
        number: index + 1,
        current: phase.startsOn <= today && phase.endsOn >= today,
        weekStarts: view
          .plan!.weeks.filter(
            (w) =>
              w.weekStart <= phase.endsOn &&
              addDays(w.weekStart, 6) >= phase.startsOn,
          )
          .map((w) => w.weekStart),
      })) ?? [],
    weeks:
      view.plan?.weeks.map((w, index) => ({
        ...w,
        number: index + 1,
        current:
          w.weekStart ===
          (view.currentWeek?.weekStart ?? view.plan?.weeks[0]?.weekStart),
      })) ?? [],
    revisions: s.journey.acceptances
      .map((a) => ({
        ...a,
        intent:
          s.journey.drafts.find((d) => d.id === a.draftId)?.revisionIntent ??
          null,
        targetDate: a.reference.targetDate,
        content:
          s.journey.drafts.find((d) => d.id === a.draftId)?.content ?? null,
      }))
      .reverse(),
  };
}
