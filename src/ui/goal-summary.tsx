// ABOUTME: Explicit whole-goal labels consume A's projection; no date, target or duration calculation happens here.
import type { GoalSummaryView } from "@/application/goal-progress-contract";
import { formatDate } from "@/application/selectors";
import { dateRangeLabel } from "./labels";
export function GoalSummary({ summary }: { summary: GoalSummaryView }) {
  const { goal, period, activePlanPeriod } = summary;
  return (
    <div className="goal-summary">
      <p className="goal-value">
        <span>Your goal</span>
        <strong>
          Reach {goal.value.toFixed(1)}
          {goal.kind === "weight" ? " kg" : "% body fat"}
        </strong>
      </p>
      <dl>
        <div>
          <dt>Requested deadline</dt>
          <dd>
            {goal.requestedDate
              ? formatDate(goal.requestedDate)
              : "No fixed deadline"}
          </dd>
        </div>
        {period && (
          <>
            <div>
              <dt>Whole journey</dt>
              <dd>
                {dateRangeLabel(period.startsOn, period.endsOn)} ·{" "}
                {period.durationDays} days
              </dd>
            </div>
            {period.endSource !== "user_requested" && (
              <div>
                <dt>
                  {period.endSource === "calculator_estimate"
                    ? "Estimated finish"
                    : "Accepted revised finish"}
                </dt>
                <dd>{formatDate(period.endsOn)}</dd>
              </div>
            )}
            {activePlanPeriod &&
              activePlanPeriod.startsOn !== period.startsOn && (
                <div>
                  <dt>Current revision begins</dt>
                  <dd>{formatDate(activePlanPeriod.startsOn)}</dd>
                </div>
              )}
          </>
        )}
      </dl>
    </div>
  );
}
