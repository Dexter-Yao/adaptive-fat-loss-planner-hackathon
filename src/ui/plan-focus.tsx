"use client";
// ABOUTME: Orients the accepted overview to its whole approach, current phase and week before the forecast.
// ABOUTME: All content and withholding/freshness decisions are supplied application projections; links change reading location only.
import type { selectMeasurementExperience } from "@/application/measurement-view";
import type { selectJourney } from "@/application/journey-selectors";
import { ArrowDown } from "lucide-react";
import type { MouseEvent } from "react";

export function PlanFocus({
  headline,
  phases,
  week,
  withheld,
  fresh,
  onOpenPlan,
}: {
  headline: string;
  phases: ReturnType<typeof selectMeasurementExperience>["phases"];
  week: ReturnType<typeof selectJourney>["currentWeek"];
  withheld: boolean;
  fresh: boolean;
  onOpenPlan: (fragment: string) => void;
}) {
  const phase = phases.find((p) => p.current);
  function openPlan(event: MouseEvent<HTMLAnchorElement>, fragment: string) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
      return;
    event.preventDefault();
    onOpenPlan(fragment);
  }
  return (
    <section
      className="plan-focus"
      aria-label="Your accepted approach and current focus"
    >
      <h2 className="generated-copy">{headline}</h2>
      {withheld ? (
        <p className="field-hint">
          Phase and weekly guidance is paused while your current information is
          reviewed.
        </p>
      ) : (
        <>
          {!fresh && <p className="field-hint">Guidance awaiting review.</p>}
          <div className="plan-focus-grid">
            <div>
              {phase ? (
                <a
                  data-plan-view
                  href={`#full-plan/${phase.startsOn}`}
                  onClick={(event) =>
                    openPlan(event, `full-plan/${phase.startsOn}`)
                  }
                >
                  <span className="meta">
                    Current phase · {phase.number} of {phases.length}
                  </span>
                  <strong className="generated-copy">{phase.label}</strong>
                </a>
              ) : (
                <p className="field-hint">No phase scheduled for today.</p>
              )}
            </div>
            <div>
              <p className="meta">This week</p>
              {week ? (
                <>
                  <p className="generated-copy">{week.focus}</p>
                  <a href="#weekly-guidance">
                    Weekly guidance <ArrowDown aria-hidden />
                  </a>
                </>
              ) : (
                <p className="field-hint">
                  No weekly suggestions saved for today.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
