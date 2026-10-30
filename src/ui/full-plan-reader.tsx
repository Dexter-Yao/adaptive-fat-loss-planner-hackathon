"use client";
// ABOUTME: A dedicated accepted-plan reader with one selected phase and week, rather than a stacked full-horizon page.
// ABOUTME: Dates, phase membership and global week numbers come from the canonical application projection.
import type { selectMeasurementExperience } from "@/application/measurement-view";
import type { selectJourney } from "@/application/journey-selectors";
import { formatDate } from "@/application/selectors";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { JourneyContent } from "@/domain/journey";
import { FormField } from "./form-field";
import { JourneyWeek } from "./journey-week";
import { dateRangeLabel } from "./labels";
import { PhaseGuidanceContent } from "./phase-guidance-content";
import { Disclosure } from "./task-components";
import { useRef } from "react";

type JourneyReading = Pick<
  ReturnType<typeof selectMeasurementExperience>,
  "phases" | "weeks"
>;

export function FullPlanReader({
  content,
  target,
  display,
  currentWeekStart,
  selectedPhaseStart,
  selectedWeekStart,
  today,
  onSelectPhase,
  onSelectWeek,
  onCheckIn,
}: {
  content: JourneyContent;
  target?: ReturnType<typeof selectJourney>["target"];
  display: JourneyReading;
  currentWeekStart?: string;
  selectedPhaseStart?: string;
  selectedWeekStart?: string;
  today: string;
  onSelectPhase: (date: string) => void;
  onSelectWeek: (phase: string, week: string) => void;
  onCheckIn: (date: string) => void;
}) {
  const weekSelect = useRef<HTMLSelectElement>(null);
  const phase =
    display.phases.find((p) => p.startsOn === selectedPhaseStart) ??
    display.phases.find((p) => p.current) ??
    display.phases[0];
  const weeks = phase
    ? display.weeks.filter((w) => phase.weekStarts.includes(w.weekStart))
    : [];
  const week =
    weeks.find((w) => w.weekStart === selectedWeekStart) ??
    weeks.find((w) => w.weekStart === currentWeekStart) ??
    weeks[0];
  const currentPhase = display.phases.find((p) => p.current);
  return (
    <section className="full-plan-reader" aria-label="Complete accepted plan">
      <div className="plan-reading-intro">
        <h2>{content.headline}</h2>
        <p className="generated-copy">{content.summary}</p>
        {target && (
          <p className="accepted-intake">
            <span>Daily intake · {formatDate(today)}</span>
            <strong>
              {target.dailyCalories.toLocaleString("en-US")} kcal/day
            </strong>
          </p>
        )}
      </div>
      <div className="plan-reader-grid">
        <nav className="phase-index" aria-label="Choose a plan phase">
          <h2>Across your journey</h2>
          {display.phases.map((p) => (
            <Button
              key={p.startsOn}
              variant={phase?.startsOn === p.startsOn ? "secondary" : "ghost"}
              className="phase-index-entry"
              aria-pressed={phase?.startsOn === p.startsOn}
              aria-controls="full-plan-phase"
              onClick={() => onSelectPhase(p.startsOn)}
            >
              <span>
                Phase {p.number}
                {p.current ? " · Current" : ""}
              </span>
              <strong>{p.label}</strong>
              <small>{dateRangeLabel(p.startsOn, p.endsOn)}</small>
            </Button>
          ))}
        </nav>
        <div id="full-plan-phase" className="plan-reader-detail">
          {phase && (
            <section
              className="plan-phase-detail"
              aria-label="Selected phase guidance"
            >
              <p className="meta">
                Phase {phase.number} ·{" "}
                {dateRangeLabel(phase.startsOn, phase.endsOn)}
              </p>
              <h2>{phase.label}</h2>
              {phase.guidance ? (
                <>
                  <p className="generated-copy">{phase.guidance.objective}</p>
                  <Disclosure title="Phase guidance and alternatives">
                    <PhaseGuidanceContent
                      phase={phase}
                      includeObjective={false}
                    />
                  </Disclosure>
                </>
              ) : (
                <PhaseGuidanceContent phase={phase} />
              )}
            </section>
          )}
          {week && phase && (
            <section
              className="plan-week-detail"
              aria-label="Selected week guidance"
            >
              <div className="plan-week-navigation">
                <FormField>
                  Weekly guide
                  <NativeSelect
                    ref={weekSelect}
                    value={week.weekStart}
                    onChange={(e) =>
                      onSelectWeek(phase.startsOn, e.target.value)
                    }
                  >
                    {weeks.map((w) => (
                      <NativeSelectOption key={w.weekStart} value={w.weekStart}>
                        Week {w.number} ·{" "}
                        {formatDate(w.weekStart, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        {w.weekStart === currentWeekStart
                          ? " · Current week"
                          : ""}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </FormField>
                {currentPhase &&
                  currentWeekStart &&
                  week.weekStart !== currentWeekStart && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        onSelectWeek(currentPhase.startsOn, currentWeekStart);
                        requestAnimationFrame(() =>
                          weekSelect.current?.focus(),
                        );
                      }}
                    >
                      Return to current week
                    </Button>
                  )}
              </div>
              <h3 className="generated-copy">{week.focus}</h3>
              <JourneyWeek
                actions={week.actions}
                checkIn={week.checkIn}
                onCheckIn={
                  week.checkIn && week.checkIn.date <= today
                    ? () => onCheckIn(week.checkIn!.date)
                    : undefined
                }
              />
            </section>
          )}
          <Disclosure title="Why this fits your life">
            <div className="personal-reasons">
              {content.whyForYou.map((r, i) => (
                <div key={i}>
                  <blockquote className="generated-copy">{r.quote}</blockquote>
                  <p className="generated-copy">{r.reason}</p>
                </div>
              ))}
            </div>
          </Disclosure>
          <Disclosure title="How we will review your progress">
            <p className="generated-copy">{content.reviewApproach}</p>
          </Disclosure>
        </div>
      </div>
    </section>
  );
}
