"use client";
// ABOUTME: One compact rendering of canonical phase guidance, shared by selected-phase detail and initial plan review.
// ABOUTME: Missing guidance stays verbatim older prose; this component never splits, generates or refreshes advice.
import type { JourneyContent } from "@/domain/journey";
import { Disclosure } from "./task-components";
export function PhaseGuidanceContent({
  phase,
  includeObjective = true,
}: {
  phase: JourneyContent["phases"][number];
  includeObjective?: boolean;
}) {
  const g = phase.guidance;
  if (!g)
    return (
      <div className="phase-summary-compatibility">
        <p>{phase.focus}</p>
      </div>
    );
  return (
    <div className="phase-guidance-content">
      {includeObjective && (
        <section>
          <h4>Build this</h4>
          <p>{g.objective}</p>
        </section>
      )}
      <section>
        <h4>Focus on</h4>
        <ul>
          {g.commitments.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      </section>
      <section>
        <h4>At your weekly check-in</h4>
        <ul>
          {g.checkInQuestions.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      </section>
      <Disclosure title="Alternatives, review & sources">
        {g.obstacles.length > 0 && (
          <section>
            <h4>If something gets in the way</h4>
            <ul>
              {g.obstacles.map((o, i) => (
                <li key={i}>
                  <span>{o.barrier}</span>
                  <br />
                  {o.alternative}
                </li>
              ))}
            </ul>
          </section>
        )}

        <h4>When to keep or discuss a change</h4>
        <ul>
          <li>
            <strong>Keep:</strong> {g.progression.keepWhen}
          </li>
          <li>
            <strong>Discuss:</strong> {g.progression.discussChangeWhen}
          </li>
        </ul>
        <p className="phase-guidance-note">
          These are review choices, not automatic changes to your plan.
        </p>
        <h4>Why these suggestions fit</h4>
        {g.evidence.map((e, i) => (
          <div className="phase-evidence" key={`${e.sourceId}:${i}`}>
            <blockquote>“{e.quote}”</blockquote>
            <p>{e.reason}</p>
          </div>
        ))}
      </Disclosure>
    </div>
  );
}
