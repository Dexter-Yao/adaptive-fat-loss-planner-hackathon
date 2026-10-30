"use client";
// ABOUTME: Read-only full-journey composition from the shared validated model-content contract.
// ABOUTME: Dates and actions are supplied facts; this view does not generate a strategy or numerical targets.
import { formatDate } from "@/application/selectors";
import type { JourneyContent } from "@/domain/journey";
import { PhaseGuidanceContent } from "./phase-guidance-content";
import { Disclosure } from "./task-components";
import { JourneyWeek } from "./journey-week";
import { dateRangeLabel } from "./labels";

export function JourneyPhases({ content }: { content: JourneyContent }) {
  return (
    <ol className="journey-phases" aria-label="Your full journey">
      {content.phases.map((phase, i) => (
        <li key={`${phase.startsOn}:${phase.label}`}>
          <span className="phase-marker" aria-hidden>
            {i + 1}
          </span>
          <div>
            <p className="meta">
              Phase {i + 1} · {dateRangeLabel(phase.startsOn, phase.endsOn)}
            </p>
            <h3>{phase.label}</h3>
            <p className="generated-copy">
              {phase.guidance?.objective ?? phase.focus}
            </p>
            <Disclosure title="Phase focus and alternatives">
              <PhaseGuidanceContent phase={phase} />
            </Disclosure>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function JourneyOverview({
  content,
  includeWeeks = true,
  includeSummary = true,
  includePhases = true,
}: {
  content: JourneyContent;
  includeWeeks?: boolean;
  includeSummary?: boolean;
  includePhases?: boolean;
}) {
  return (
    <div className="journey-overview">
      {includeSummary && (
        <div className="journey-summary">
          <h2>{content.headline}</h2>
          <p className="generated-copy">{content.summary}</p>
        </div>
      )}
      {includePhases && <JourneyPhases content={content} />}
      <Disclosure title="Why this fits your life">
        <div className="personal-reasons">
          {content.whyForYou.map((reason, i) => (
            <div key={`${reason.sourceId}:${i}`}>
              <blockquote>“{reason.quote}”</blockquote>
              <p>{reason.reason}</p>
            </div>
          ))}
        </div>
      </Disclosure>
      {includeWeeks && (
        <div className="journey-week-list">
          <h2>Week by week</h2>
          {content.weeks.slice(0, 1).map((week) => (
            <Disclosure
              key={week.weekStart}
              defaultOpen
              title={
                <span className="week-outline-title">
                  <span>First week · {formatDate(week.weekStart)}</span>
                  <small>{week.focus}</small>
                </span>
              }
            >
              <JourneyWeek actions={week.actions} checkIn={week.checkIn} />
            </Disclosure>
          ))}
          {content.weeks.length > 1 && (
            <Disclosure
              title={`Explore the remaining ${content.weeks.length - 1} weeks`}
            >
              {content.weeks.slice(1).map((week, index) => (
                <Disclosure
                  key={week.weekStart}
                  title={
                    <span className="week-outline-title">
                      <span>
                        Week {index + 2} · {formatDate(week.weekStart)}
                      </span>
                      <small>{week.focus}</small>
                    </span>
                  }
                >
                  <JourneyWeek actions={week.actions} checkIn={week.checkIn} />
                </Disclosure>
              ))}
            </Disclosure>
          )}
        </div>
      )}
      <Disclosure title="How we will review your progress">
        <p>{content.reviewApproach}</p>
      </Disclosure>
    </div>
  );
}
