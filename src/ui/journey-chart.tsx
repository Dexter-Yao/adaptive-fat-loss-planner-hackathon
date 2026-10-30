"use client";
// ABOUTME: Frozen B-to-D controlled chart entry point; metric/phase selections belong to its caller.
// ABOUTME: Canonical snapshots stay immutable; local legend/zoom choices never become model inputs.
import type { JourneyChartProps } from "@/application/journey-chart-contract";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ForecastChart } from "./forecast-chart";
import { chartModelStates } from "./forecast-projection";
export function JourneyChart({
  input,
  metric,
  selectedPhase,
  onSelectPhase,
  onMetricChange,
  display,
  onPinSelection,
  onVariationChange,
}: JourneyChartProps) {
  const hasPredictions = chartModelStates(input.forecast, metric).some(
    (model) => model.status === "available",
  );
  return (
    <section className="journey-chart" aria-label="Journey forecast comparison">
      <div className="chart-controls">
        <Tabs
          value={metric}
          onValueChange={(value) => onMetricChange(value as typeof metric)}
        >
          <TabsList aria-label="Forecast measure">
            <TabsTrigger value="weight">Weight</TabsTrigger>
            <TabsTrigger value="body_fat">Body fat</TabsTrigger>
          </TabsList>
        </Tabs>
        {(!hasPredictions || input.freshness !== "current") && (
          <span className="chart-status" role="status">
            {!hasPredictions
              ? "Predictions unavailable for this measure"
              : input.freshness === "stale"
                ? "Previous predictions · update pending"
                : "Current prediction unavailable"}
          </span>
        )}
      </div>
      <ForecastChart
        key={`${input.binding.sessionId}:${input.binding.acceptedJourneyId}`}
        forecast={input.forecast}
        reference={input.reference ?? undefined}
        logs={input.observations}
        profile={input.profile}
        metric={metric}
        goalValue={input.goal.kind === metric ? input.goal.value : undefined}
        period={input.period}
        checkIns={input.checkIns}
        phases={input.phases}
        selectedPhase={selectedPhase ?? undefined}
        onSelectPhase={onSelectPhase}
        referenceInitiallyVisible={false}
        showPhaseGuidance={
          !input.guidanceWithheld && input.freshness === "current"
        }
        defaultSelection={display?.defaults[metric] ?? "mean"}
        dailyVariationVisible={display?.dailyVariation ?? true}
        variationSeed={input.binding.sessionId}
        onPinSelection={
          onPinSelection
            ? (selection) => onPinSelection(metric, selection)
            : undefined
        }
        onVariationChange={onVariationChange}
        forecastCurrent={
          input.freshness === "current" && !input.guidanceWithheld
        }
      />
    </section>
  );
}
