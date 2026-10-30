// ABOUTME: Starting/latest reports and conditional goal outlook render only A's authoritative values/states.
// ABOUTME: Goal tint never evaluates a person's measurement and never represents a probability of success.
import type {
  GoalMetricValue,
  GoalProgressView,
  MeasurementView,
} from "@/application/goal-progress-contract";
import { formatDate } from "@/application/selectors";
import { Card } from "@/components/ui/card";
import { ExplanationDialog } from "./explanation-dialog";
export function metricText(reading: GoalMetricValue) {
  return `${reading.value.toFixed(1)}${reading.metric === "weight" ? " kg" : "%"}`;
}
function MeasurementCard({
  title,
  measurement,
}: {
  title: string;
  measurement: MeasurementView;
}) {
  return (
    <Card>
      <h3>{title}</h3>
      <strong>
        {measurement.status === "available"
          ? metricText(measurement.reading)
          : "Not recorded"}
      </strong>
      <p>
        {measurement.status === "available"
          ? `Reported ${formatDate(measurement.date)}${measurement.method ? ` · ${measurement.method.toUpperCase()}` : ""}`
          : measurement.reason}
      </p>
    </Card>
  );
}
export function ProgressCards({ progress }: { progress: GoalProgressView }) {
  const o = progress.outlook,
    goal = progress.summary.goal;
  const reading = o.status === "ready" ? o.projectedAtGoalDate : null;
  return (
    <section
      className="progress-metrics"
      aria-label="Starting point, latest measurement and goal outlook"
    >
      <MeasurementCard
        title="Starting measurement"
        measurement={progress.baseline}
      />
      <MeasurementCard
        title="Latest measurement"
        measurement={progress.latest}
      />
      <Card
        className="outlook-card"
        data-state={o.status === "ready" ? o.assessment : "unknown"}
      >
        <div className="outlook-card-heading">
          <h3>
            Goal outlook <span className="outlook-basis">· Hall</span>
          </h3>
          <ExplanationDialog title="About your goal outlook">
            <p>{o.status === "ready" ? o.reason : o.message}</p>
            <p>
              A conditional Hall-model estimate using the current accepted
              assumptions. This is not a probability or a promise.
            </p>
            {o.status === "ready" && (
              <p>Calculated through {formatDate(o.evaluatedThrough)}.</p>
            )}
          </ExplanationDialog>
        </div>
        {o.status === "unknown" ? (
          <>
            <strong>Not assessed</strong>
            <p>{o.message}</p>
          </>
        ) : goal.requestedDate && reading ? (
          <>
            <strong>{metricText(reading.reading)}</strong>
            <p>Expected at {formatDate(reading.date)}</p>
          </>
        ) : o.estimatedArrivalDate ? (
          <>
            <strong>{formatDate(o.estimatedArrivalDate)}</strong>
            <p>
              Estimated arrival at {goal.value}
              {goal.kind === "weight" ? " kg" : "% body fat"}
            </p>
          </>
        ) : reading ? (
          <>
            <strong>{metricText(reading.reading)}</strong>
            <p>Expected at {formatDate(reading.date)}</p>
          </>
        ) : (
          <>
            <strong>Not reached yet</strong>
            <p>No arrival within the evaluated period.</p>
          </>
        )}
        {o.status === "ready" && (
          <span className="outlook-state">
            {o.assessment === "on_track"
              ? "On track under current assumptions"
              : "Plan may need a review"}
          </span>
        )}
      </Card>
    </section>
  );
}
