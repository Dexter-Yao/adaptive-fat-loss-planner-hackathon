"use client";
// ABOUTME: Shared read-only weekly suggestions for proposal review, the current week and saved plan history.
// ABOUTME: Renders supplied actions verbatim; alternatives unfold without creating completion or diary facts.
import { formatDate } from "@/application/selectors";
import { Button } from "@/components/ui/button";
import type { JourneyContent } from "@/domain/journey";
import { CalendarCheck } from "lucide-react";
import { Disclosure } from "./task-components";

export function JourneyWeek({
  actions,
  checkIn,
  onCheckIn,
}: {
  actions: readonly {
    title: string;
    details: string;
    fallback?: string;
    successCheck?: string;
  }[];
  checkIn?: Pick<JourneyContent["weeks"][number]["checkIn"], "date" | "label">;
  onCheckIn?: () => void;
}) {
  return (
    <div className="journey-week-content">
      <ul className="journey-action-list">
        {actions.map((action, index) => (
          <li key={index}>
            <h3>{action.title}</h3>
            <p className="generated-copy">{action.details}</p>
            {(action.fallback || action.successCheck) && (
              <Disclosure title="Alternatives and what to look for">
                {action.fallback && (
                  <p className="generated-copy">
                    <strong>If this is difficult:</strong> {action.fallback}
                  </p>
                )}
                {action.successCheck && (
                  <p className="generated-copy">
                    <strong>What to reflect on:</strong> {action.successCheck}
                  </p>
                )}
              </Disclosure>
            )}
          </li>
        ))}
      </ul>
      {checkIn && (
        <div className="weekly-checkpoint">
          <p>
            <CalendarCheck aria-hidden />
            <strong>{checkIn.label}</strong> · {formatDate(checkIn.date)}
          </p>
          <p className="field-hint">Weight, body fat or a note.</p>
          {onCheckIn && (
            <Button variant="outline" onClick={onCheckIn}>
              Update this check-in
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
