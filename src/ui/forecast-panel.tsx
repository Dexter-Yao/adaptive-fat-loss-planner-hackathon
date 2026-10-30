"use client";
// ABOUTME: Measurement history and forecast changes consume A's snapshot, immutable reference and review state.
// ABOUTME: This screen does not infer adherence, fit model parameters or silently apply a coach proposal.
import type { GoalProgressView } from "@/application/goal-progress-contract";
import type { JourneyChartInput } from "@/application/journey-chart-contract";
import { ProgressCards } from "./progress-cards";
import { formatDate } from "@/application/selectors";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { JourneyChart } from "./journey-chart";
import { useAppPath, useJourneyView } from "./journey-view";
import { EmptyTask } from "./task-components";
export function ForecastPanel({
  progress,
  metric,
  onMetricChange,
  chartInput,
  selectedPhase,
  onSelectPhase,
}: {
  progress: GoalProgressView;
  metric: "weight" | "body_fat";
  onMetricChange: (metric: "weight" | "body_fat") => void;
  chartInput: JourneyChartInput | null;
  selectedPhase: string | null;
  onSelectPhase: (date: string) => void;
}) {
  const { app, view, run } = useJourneyView(),
    path = useAppPath();
  const s = app.session;
  if (!s || !view) return null;
  if (!view.hasAcceptedJourney)
    return (
      <EmptyTask
        title="Progress begins with your plan"
        description="Review and accept your whole plan, then check in with weight, body fat or a note."
      >
        <Button asChild>
          <Link href={path("/plan")}>Review my plan</Link>
        </Button>
      </EmptyTask>
    );
  const snap = view.progress.snapshot;
  return (
    <>
      <h2>Forecast</h2>
      <div className="forecast-status">
        <p>Updates automatically after a new weight or body-fat measurement.</p>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh forecast"
          title="Refresh forecast — updates also run automatically after a measurement"
          disabled={app.journey.running}
          onClick={() => run(() => app.journey.recalculate(true))}
        >
          <RefreshCw
            aria-hidden
            className={app.journey.running ? "animate-spin" : undefined}
          />
        </Button>
      </div>
      {!view.progress.numbersFresh && (
        <Alert className="compact-callout">
          {snap
            ? `Last calculated ${formatDate(snap.asOfDate)}. The latest information is not included yet.`
            : "Measurements are saved. The forecast is still pending."}
        </Alert>
      )}
      <ProgressCards progress={progress} />
      {chartInput && (
        <Card className="trend-panel">
          <JourneyChart
            input={chartInput}
            metric={metric}
            onMetricChange={onMetricChange}
            selectedPhase={selectedPhase}
            onSelectPhase={onSelectPhase}
            display={s.forecastDisplay}
            onPinSelection={app.pinForecastSelection}
            onVariationChange={app.setDailyVariation}
          />
        </Card>
      )}
    </>
  );
}
