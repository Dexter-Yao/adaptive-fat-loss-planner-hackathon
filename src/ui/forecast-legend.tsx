"use client";
// ABOUTME: Compact exclusive comparison controls; pinning delegates to the application's verified storage command.
import type { ForecastSelection } from "@/application/forecast-display";
import { Button } from "@/components/ui/button";
import { Pin } from "lucide-react";
import type { chartModelStates } from "./forecast-projection";
import { MODEL_LABELS } from "./labels";
import { ModelExplanation } from "./model-explanation";
const shortLabels = {
  hall: "Hall / NIDDK",
  thomas: "Thomas / Pennington",
  antonetti: "Modified Antonetti",
} as const;
export function forecastSelectionLabel(selection: ForecastSelection): string {
  return selection === "mean" ? "Model mean" : MODEL_LABELS[selection];
}
export function ForecastLegend({
  states,
  selection,
  meanModelCount,
  defaultSelection,
  onSelect,
  onPin,
  hasMeasurements,
  metric,
}: {
  states: ReturnType<typeof chartModelStates>;
  selection: ForecastSelection;
  meanModelCount: number;
  defaultSelection: ForecastSelection;
  onSelect: (selection: ForecastSelection) => void;
  onPin?: () => void;
  hasMeasurements: boolean;
  metric: "weight" | "body_fat";
}) {
  const pinned = selection === defaultSelection;
  return (
    <div className="forecast-comparison-controls">
      <div
        className="forecast-legend"
        role="group"
        aria-label="Choose a prediction to compare with measurements"
      >
        <div className="forecast-legend-item">
          <Button
            variant="ghost"
            className="forecast-model-select"
            aria-pressed={selection === "mean"}
            disabled={!meanModelCount}
            title="Equal-weight mean of applicable models on common dates"
            onClick={() => onSelect("mean")}
          >
            <span className="series-key series-mean" aria-hidden />
            Mean{" "}
            <span className="forecast-model-count">({meanModelCount})</span>
          </Button>
          <ModelExplanation model="mean" />
        </div>
        {states
          .filter((s) => s.status !== "unsupported")
          .map((s) => (
            <div className="forecast-legend-item" key={s.id}>
              <Button
                variant="ghost"
                className="forecast-model-select"
                aria-label={`Compare ${MODEL_LABELS[s.id]}`}
                aria-pressed={selection === s.id}
                disabled={s.status !== "available"}
                title={`${MODEL_LABELS[s.id]}${s.status === "available" ? "" : ` — ${s.message}`}`}
                onClick={() => onSelect(s.id)}
              >
                <span className={`series-key series-${s.id}`} aria-hidden />
                {shortLabels[s.id]}
                {s.status !== "available" && (
                  <span className="forecast-model-count">
                    {s.status === "failed"
                      ? "Calculation failed"
                      : "unavailable"}
                  </span>
                )}
              </Button>
              <ModelExplanation model={s.id} />
            </div>
          ))}
      </div>
      <div className="forecast-legend-meta">
        <span className="forecast-actual-label">
          <span className="series-key series-recorded" aria-hidden />
          Actual measurements
          {!hasMeasurements && (
            <span className="forecast-model-count">· none in this range</span>
          )}
        </span>
        {onPin && (
          <div className="forecast-default">
            <span className="forecast-default-label" role="status">
              {metric === "weight" ? "Weight" : "Body-fat"} default:{" "}
              {defaultSelection === "mean"
                ? "Model mean"
                : shortLabels[defaultSelection]}
            </span>
            {!pinned && (
              <Button
                variant="ghost"
                className="forecast-pin"
                aria-label={`Use ${forecastSelectionLabel(selection)} as default`}
                onClick={onPin}
                title="Save this comparison for the next visit"
              >
                <Pin aria-hidden />
                Use selected as default
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
