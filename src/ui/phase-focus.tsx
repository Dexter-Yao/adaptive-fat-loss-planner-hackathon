"use client";
// ABOUTME: C-owned phase detail and navigation composition, separated from B's chart/date geometry.
// ABOUTME: Structured guidance and verbatim older summaries share a renderer, with no model or storage work in UI.
import type { JourneyPhase } from "@/application/journey-timeline";
import { dateRangeLabel } from "./labels";
import { Button } from "@/components/ui/button";
import { PhaseGuidanceContent } from "./phase-guidance-content";
import { Disclosure } from "./task-components";
import { ChevronLeft, ChevronRight } from "lucide-react";
export interface PhaseFocusProps {
  phase: JourneyPhase;
  number: number;
  total: number;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}
export function PhaseFocus({
  phase,
  number,
  total,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
}: PhaseFocusProps) {
  return (
    <section
      className="phase-focus"
      id="phase-focus"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="phase-focus-heading">
        <div>
          <p className="meta">
            {phase.current ? "Current phase · " : ""}Phase {number} of {total} ·{" "}
            {dateRangeLabel(phase.startsOn, phase.endsOn)}
          </p>
          <h3>{phase.label}</h3>
        </div>
        <div className="phase-navigation">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Previous phase"
            disabled={!canPrevious}
            onClick={onPrevious}
          >
            <ChevronLeft />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Next phase"
            disabled={!canNext}
            onClick={onNext}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      {phase.guidance ? (
        <>
          <p className="generated-copy">{phase.guidance.objective}</p>
          <Disclosure title="Phase guidance and alternatives">
            <PhaseGuidanceContent phase={phase} includeObjective={false} />
          </Disclosure>
        </>
      ) : (
        <PhaseGuidanceContent phase={phase} />
      )}
    </section>
  );
}
