"use client";
// ABOUTME: Optional forecast assumptions, model descriptions and previous calculations inside the overview only.
// ABOUTME: Renders saved calculation provenance without recalculating numbers or owning freshness.
import { selectMeasurementExperience } from "@/application/measurement-view";
import { formatDate } from "@/application/selectors";
import { endpoint } from "@/domain/forecast";
import { useJourneyView } from "./journey-view";
import { Disclosure } from "./task-components";
import { ModelDetails } from "./model-details";
import { usePlanLocation } from "./plan-navigation";
import { useEffect, useState } from "react";
export function ForecastDetails() {
  const hash = usePlanLocation(),
    [open, setOpen] = useState(false);
  useEffect(() => {
    if (hash === "#models") setOpen(true);
  }, [hash]);
  const { app, view } = useJourneyView(),
    s = app.session;
  if (!s || !view) return null;
  const display = selectMeasurementExperience(s, app.today),
    f = view.progress.snapshot?.forecast;
  if (!f && !view.progress.history.length) return null;
  return (
    <section id="models" className="forecast-details">
      <Disclosure
        title="Forecast details, models and assumptions"
        open={open}
        onOpenChange={setOpen}
      >
        {f && (
          <Disclosure title="What this forecast is based on">
            <p>
              Future intake and activity remain assumptions. Measurements update
              the conditional forecast; they do not establish why weight
              changed.
            </p>
            {view.progress.numbersFresh && display.difference && (
              <p>
                Hall forecast difference for{" "}
                {formatDate(display.difference.date)}:{" "}
                {display.difference.weightKg.toFixed(1)} kg, current minus
                accepted reference at that same future date. This compares two
                forecasts, not today's measured deviation.
              </p>
            )}
            <dl className="evidence-grid">
              <div>
                <dt>Baseline</dt>
                <dd>
                  {s.profile.ageYears} years · {s.profile.sex} ·{" "}
                  {s.profile.heightCm} cm · {s.profile.weightKg} kg
                </dd>
              </div>
              <div>
                <dt>Starting body fat</dt>
                <dd>
                  {f.baseline.bodyFatPct.toFixed(1)}% ·{" "}
                  {f.baseline.bodyFatSource === "user_reported"
                    ? "your measurement"
                    : "formula estimate"}
                </dd>
              </div>
              <div>
                <dt>Starting energy estimate</dt>
                <dd>
                  {Math.round(f.baseline.tdeeKcal)} kcal/day · PAL{" "}
                  {f.baseline.pal}
                </dd>
              </div>
              <div>
                <dt>Calculated</dt>
                <dd>{formatDate(f.asOfDate)}</dd>
              </div>
            </dl>
            <ul>
              {f.assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
            <p>
              The measurement update policy is an application extension to the
              published models. It preserves model state; it is not a diagnosis
              or a validated estimate of your metabolism.
            </p>
            <Disclosure title="Calculation version">
              <p className="meta hash-value">
                {f.inputHash} · {f.policyVersion}
              </p>
            </Disclosure>
          </Disclosure>
        )}
        {view.progress.history.length > 0 && (
          <Disclosure title="Previous forecasts">
            <ul>
              {view.progress.history.map((h, i) => (
                <li key={i}>
                  {formatDate(h.asOfDate)} ·{" "}
                  {h.forecast
                    ? `Hall ${endpoint(h.forecast)?.weightKg.toFixed(1)} kg at ${formatDate(h.forecast.projectionDate)}`
                    : "Forecast withheld"}
                </li>
              ))}
            </ul>
            <p>
              Earlier results are retained with their original inputs and dates.
            </p>
          </Disclosure>
        )}
        {f && (
          <Disclosure title="Forecast models and assumptions">
            <ModelDetails forecast={f} profile={s.profile} logs={s.logs} />
          </Disclosure>
        )}
      </Disclosure>
    </section>
  );
}
