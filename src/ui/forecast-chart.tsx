"use client";
// ABOUTME: Exact multi-model curves with one shared date domain for weeks, check-ins and phases.
// ABOUTME: Means and separate fluctuation illustrations are display-only; model points remain exact.
import {
  phaseTimeline,
  timelineTime,
  type JourneyPhase,
} from "@/application/journey-timeline";
import { formatDate } from "@/application/selectors";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Info, ZoomIn, ZoomOut, ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ReferenceArea,
  XAxis,
  YAxis,
} from "recharts";
import type {
  DailyObservation,
  ForecastSnapshot,
  ModelId,
  ProfileFacts,
} from "../domain/contracts";
import {
  chartDateLabel,
  chartPeriodLabel,
  chartProjection,
  chartModelStates,
  journeyWeekTicks,
  fitJourneyTicks,
  CHART_MODEL_IDS,
} from "./forecast-projection";
import { MODEL_LABELS } from "./labels";
import { PhaseFocus } from "./phase-focus";
import type { ForecastSelection } from "@/application/forecast-display";
import { dailyVariation } from "@/application/daily-variation";
import { ForecastLegend, forecastSelectionLabel } from "./forecast-legend";
import { ForecastOptions } from "./forecast-options";
import { Disclosure } from "./task-components";
const chartLayout = { left: -18, right: 8, top: 16, bottom: 0, yAxisWidth: 60 };
const plotLeft = chartLayout.left + chartLayout.yAxisWidth;
const xAxisHeight = 64;
const config = {
  recorded: { label: "Actual measurements", color: "var(--foreground)" },
  mean: { label: "Model mean", color: "var(--chart-1)" },
  illustration: {
    label: "Daily fluctuation · illustration",
    color: "var(--chart-1)",
  },
  hall: { label: MODEL_LABELS.hall, color: "var(--chart-1)" },
  thomas: { label: MODEL_LABELS.thomas, color: "var(--chart-2)" },
  antonetti: { label: MODEL_LABELS.antonetti, color: "var(--chart-3)" },
  range: { label: "Input-assumption range", color: "var(--chart-1)" },
  reference: { label: "Accepted Hall reference", color: "var(--chart-4)" },
} satisfies ChartConfig;
const ZOOMS = [0, 1, 1.5, 2, 3];
// Explicit Recharts layers keep reports in front even when lines register in a different render order.
const seriesLayers = {
  reference: 200,
  modelContext: 300,
  illustration: 350,
  prediction: 400,
  measurements: 500,
};
export function ForecastChart({
  forecast,
  logs,
  profile,
  metric = "weight",
  scenario = "current",
  models = [...CHART_MODEL_IDS],
  goalValue,
  reference,
  phases = [],
  selectedPhase,
  onSelectPhase,
  period,
  checkIns = [],
  referenceInitiallyVisible = true,
  showPhaseGuidance = true,
  defaultSelection = "mean",
  dailyVariationVisible = false,
  variationSeed = "forecast",
  onPinSelection,
  onVariationChange,
  forecastCurrent = true,
}: {
  forecast: ForecastSnapshot | null;
  logs: readonly DailyObservation[];
  profile: ProfileFacts;
  metric?: "weight" | "body_fat";
  scenario?: "current" | "accepted";
  models?: ModelId[];
  goalValue?: number;
  reference?: ForecastSnapshot;
  phases?: readonly JourneyPhase[];
  selectedPhase?: string;
  onSelectPhase?: (date: string) => void;
  period?: { startsOn: string; endsOn: string };
  checkIns?: readonly { weekStart: string; date: string; label: string }[];
  referenceInitiallyVisible?: boolean;
  showPhaseGuidance?: boolean;
  defaultSelection?: ForecastSelection;
  dailyVariationVisible?: boolean;
  variationSeed?: string;
  onPinSelection?: (selection: ForecastSelection) => boolean;
  onVariationChange?: (show: boolean) => boolean;
  forecastCurrent?: boolean;
}) {
  const [selections, setSelections] = useState<
      Partial<Record<typeof metric, ForecastSelection>>
    >({}),
    [localVariation, setLocalVariation] = useState<boolean | null>(null),
    [showReference, setShowReference] = useState(referenceInitiallyVisible),
    [showRange, setShowRange] = useState(false),
    [overflowing, setOverflowing] = useState(false),
    [layout, setLayout] = useState({ width: 0, weekWidth: 0 }),
    [zoomIndex, setZoomIndex] = useState(0);
  const scroll = useRef<HTMLDivElement>(null),
    zoomAnchor = useRef<number | null>(null);
  const states = chartModelStates(forecast, metric).filter((state) =>
    models.includes(state.id),
  );
  const selection = selections[metric] ?? defaultSelection;
  const availableModels = states
    .filter((s) => s.status === "available")
    .map((s) => s.id);
  const visibleModels = availableModels.filter(
    (id) => selection === "mean" || id === selection,
  );
  const showVariation = localVariation ?? dailyVariationVisible;
  const original = reference?.modelResults.find((m) => m.id === "hall");
  const referenceAvailable =
    original?.status === "ok" && (metric === "weight" || original.composition);
  const referenceOn = showReference && referenceAvailable;
  const projection = chartProjection(
    forecast,
    logs,
    metric,
    scenario,
    visibleModels,
    goalValue,
    profile,
    referenceOn ? reference : undefined,
    {
      period,
      showMeasurements: true,
      showRange,
      includeMean: selection === "mean",
    },
  );
  // Domain is supplied by the accepted plan, not stretched by measurements outside it.
  const startsOn =
    period?.startsOn ?? projection.rows[0]?.date ?? profile.startDate;
  const endsOn = period?.endsOn ?? projection.rows.at(-1)?.date ?? startsOn;
  const first = timelineTime(startsOn),
    last = timelineTime(endsOn);
  const ticks = journeyWeekTicks(
      startsOn,
      endsOn,
      checkIns.map((c) => c.weekStart),
    ),
    stages = phaseTimeline(phases, first, last);
  const selected =
    stages.find((p) => p.startsOn === selectedPhase) ??
    stages.find((p) => p.current) ??
    stages[0];
  const selectedIndex = stages.findIndex(
    (p) => p.startsOn === selected?.startsOn,
  );
  const checkpoints = checkIns.filter(
    (c) => c.date >= startsOn && c.date <= endsOn,
  );
  const plotWidth = layout.width - plotLeft - chartLayout.right;
  const visibleTicks = fitJourneyTicks(ticks, plotWidth, layout.weekWidth);
  const checkpointLabels =
    layout.weekWidth > 0 &&
    plotWidth / Math.max(1, checkpoints.length) >= layout.weekWidth;
  const rows = projection.rows.map((row) => ({
    ...row,
    checkIns: checkpoints.filter((c) => c.date === row.date),
  }));
  const hasValues = rows.some(
    (row) =>
      row.recorded != null ||
      row.reference != null ||
      visibleModels.some((id) => row[id] != null),
  );
  const canVariation =
    metric === "weight" && scenario === "current" && forecastCurrent;
  const trend = rows.flatMap((row) => {
    const value = selection === "mean" ? row.mean : row[selection];
    return value == null || !Number.isFinite(value)
      ? []
      : [{ date: row.date, value }];
  });
  const variation =
    canVariation && showVariation && forecast
      ? dailyVariation(
          trend,
          startsOn,
          endsOn,
          forecast.asOfDate,
          variationSeed,
        )
      : [];
  const yMin = Math.min(
    projection.min,
    ...variation.map((p) => Math.floor(p.illustration)),
  );
  const yMax = Math.max(
    projection.max,
    ...variation.map((p) => Math.ceil(p.illustration)),
  );
  const unit = metric === "weight" ? "kg" : "%";
  const yTicks = Array.from(
    { length: 5 },
    (_, index) => yMin + ((yMax - yMin) * index) / 4,
  );
  const canRange = projection.rangeAvailable && scenario === "current";
  const effectiveConfig = {
    ...config,
    illustration: {
      label: config.illustration.label,
      color: selection === "mean" ? config.mean.color : config[selection].color,
    },
    range: {
      label: `${MODEL_LABELS[visibleModels[0] ?? "hall"]} input-assumption range`,
      color: config[visibleModels[0] ?? "hall"].color,
    },
  };
  function zoom(next: number) {
    const el = scroll.current;
    zoomAnchor.current =
      el && el.scrollWidth ? el.scrollLeft / el.scrollWidth : 0;
    setZoomIndex(next);
  }
  useLayoutEffect(() => {
    if (scroll.current && zoomAnchor.current != null) {
      scroll.current.scrollLeft =
        zoomAnchor.current * scroll.current.scrollWidth;
      zoomAnchor.current = null;
    }
  }, [zoomIndex]);
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const update = () => {
      const width =
        el.lastElementChild?.getBoundingClientRect().width ?? el.clientWidth;
      // Recharts can briefly retain its old SVG width after the canvas resizes.
      // Navigation follows the observed shared canvas, not that transient overflow.
      setOverflowing(width > el.clientWidth + 1);
      const weekWidth = parseFloat(
        getComputedStyle(el).getPropertyValue(
          "--component-journey-chart-week-width",
        ),
      );
      setLayout((previous) =>
        previous.width === width && previous.weekWidth === weekWidth
          ? previous
          : { width, weekWidth },
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.lastElementChild) observer.observe(el.lastElementChild);
    update();
    return () => observer.disconnect();
  }, [zoomIndex, ticks.length]);
  useEffect(() => {
    const el = scroll.current;
    if (el && selected && last > first)
      el.scrollLeft = Math.max(
        0,
        plotLeft +
          ((selected.start - first) / (last - first)) *
            (el.scrollWidth - plotLeft - chartLayout.right) -
          el.clientWidth / 4,
      );
  }, [selectedPhase]);
  return (
    <figure
      className="chart-wrap journey-comparison"
      aria-label={`${metric === "weight" ? "Weight" : "Body-fat"} predictions and measurements`}
    >
      <div className="forecast-toolbar">
        <div className="chart-status">
          <span>
            {chartPeriodLabel(startsOn, endsOn)} · {unit}
          </span>
        </div>
        <div className="forecast-actions">
          <ForecastOptions
            weight={metric === "weight"}
            showVariation={showVariation}
            onVariation={(show) => {
              if (onVariationChange) onVariationChange(show);
              else setLocalVariation(show);
            }}
            referenceAvailable={Boolean(referenceAvailable)}
            showReference={Boolean(referenceOn)}
            onReference={setShowReference}
            canRange={canRange}
            showRange={showRange}
            onRange={setShowRange}
          />
          <Button
            size="icon"
            variant="ghost"
            aria-label="Zoom out forecast"
            title="Zoom out"
            disabled={zoomIndex === 0}
            onClick={() => zoom(zoomIndex - 1)}
          >
            <ZoomOut />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Zoom in forecast"
            title="Zoom in"
            disabled={zoomIndex === ZOOMS.length - 1}
            onClick={() => zoom(zoomIndex + 1)}
          >
            <ZoomIn />
          </Button>
          <Button
            variant="ghost"
            aria-label="Show whole journey"
            aria-pressed={zoomIndex === 0}
            title="Fit the complete journey"
            onClick={() => {
              zoom(0);
              zoomAnchor.current = 0;
              scroll.current?.scrollTo({ left: 0 });
            }}
          >
            Whole journey
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="About forecast models and check-ins"
                title="About this chart"
              >
                <Info />
              </Button>
            </DialogTrigger>
            <DialogContent className="forecast-help">
              <DialogHeader>
                <DialogTitle>Reading your forecast</DialogTitle>
                <DialogDescription>
                  Conditional model predictions, actual measurements and planned
                  check-ins are different kinds of information.
                </DialogDescription>
              </DialogHeader>
              <ul>
                <li>
                  <strong>Current predictions:</strong> three published model
                  implementations use the same dated inputs. The dashed model
                  mean is an equal-weight comparison on dates shared by the
                  available, applicable models. Select a model to compare it
                  with measurements. A mean is not validated as more accurate.
                  Goal outlook and coach triggers continue to use Hall.
                </li>
                <li>
                  <strong>Actual measurements:</strong> the solid line joins
                  reports on different dates; dots mark recorded values. No
                  measurement is invented for a planned check-in. Missing
                  baseline body fat is not plotted as measured. Measurements
                  outside the displayed period remain in the saved history.
                </li>
                <li>
                  <strong>Accepted Hall reference:</strong> one optional,
                  unchanged trajectory saved with the accepted plan. It may end
                  before a later revised horizon; it is never extended by chart
                  code.
                </li>
                <li>
                  <strong>Weekly check-in:</strong> vertical dotted lines use
                  the dates already in your plan. Week labels follow the
                  accepted weekly plan, including a partial first week. Scroll
                  within a long chart or zoom in to inspect the dates.
                </li>
                <li>
                  <strong>Your goal:</strong> the horizontal dashed line marks
                  the requested value when it matches the displayed measure, not
                  a model prediction.
                </li>
                <li>
                  <strong>Body fat:</strong> Hall and Thomas/Pennington support
                  it. Modified Antonetti predicts weight only. Fat-free mass is
                  not muscle.
                </li>
                <li>
                  <strong>Uncertainty:</strong> model differences do not form a
                  confidence interval. An optional single-model input-assumption
                  band, when available, varies missing-input assumptions only.
                  Daily fluctuations are a separate, labeled illustration.
                </li>
              </ul>
              <p>
                Model trends retain exact calculated values with straight
                segments between daily samples. The lighter morning/evening
                illustration uses a bounded display assumption; it never enters
                forecasts, goal assessments or coach context. It stays stable on
                refresh and zoom and is not applied to body-fat readings.
                Individual readings can vary with measurement conditions and
                physiology. None of these displays is a clinical accuracy claim.
              </p>
              {checkpoints.length > 0 && (
                <div>
                  <h3>Scheduled check-ins</h3>
                  <ul>
                    {checkpoints.map((c) => (
                      <li key={`${c.weekStart}:${c.date}`}>
                        {chartDateLabel(c.date, undefined, true)} — {c.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p>
                <a
                  href="https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner"
                  target="_blank"
                  rel="noreferrer"
                >
                  Hall / NIDDK model
                </a>{" "}
                ·{" "}
                <a
                  href="https://pmc.ncbi.nlm.nih.gov/articles/PMC9114632/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Thomas reference
                </a>{" "}
                ·{" "}
                <a
                  href="https://pmc.ncbi.nlm.nih.gov/articles/PMC9691568/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Modified Antonetti
                </a>
              </p>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {overflowing && (
        <div className="forecast-scroll-actions">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Scroll forecast earlier"
            onClick={() =>
              scroll.current?.scrollBy({
                left: -(scroll.current?.clientWidth ?? 0) * 0.75,
              })
            }
          >
            <ArrowLeft />
          </Button>
          <span className="chart-status">
            Weekly dates · scroll within the chart to explore
          </span>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Scroll forecast later"
            onClick={() =>
              scroll.current?.scrollBy({
                left: (scroll.current?.clientWidth ?? 0) * 0.75,
              })
            }
          >
            <ArrowRight />
          </Button>
        </div>
      )}
      <div
        className="journey-chart-scroll"
        ref={scroll}
        tabIndex={0}
        role="region"
        aria-label="Scrollable forecast and phase timeline"
      >
        {hasValues && (
          <div
            className="forecast-pinned-scale"
            style={{ width: plotLeft }}
            aria-hidden="true"
          >
            <div
              className="forecast-scale-ticks"
              style={{ top: chartLayout.top, bottom: xAxisHeight }}
            >
              {yTicks.map((value, index) => (
                <span key={value} style={{ top: `${100 - index * 25}%` }}>
                  {value.toFixed(1)}
                </span>
              ))}
            </div>
          </div>
        )}
        <div
          className="journey-chart-canvas"
          style={{
            minWidth:
              zoomIndex === 0
                ? "100%"
                : `calc(${Math.max(1, ticks.filter((t) => t.kind === "week").length - 1) * ZOOMS[zoomIndex]} * var(--component-journey-chart-week-width) + ${chartLayout.yAxisWidth + chartLayout.right}px)`,
          }}
        >
          {hasValues ? (
            <ChartContainer config={effectiveConfig} className="forecast-chart">
              <ComposedChart
                accessibilityLayer
                data={rows}
                margin={chartLayout}
              >
                <CartesianGrid vertical={false} />
                {selected && (
                  <ReferenceArea
                    x1={selected.start}
                    x2={selected.end}
                    fill="var(--primary)"
                    fillOpacity={0.07}
                    strokeOpacity={0}
                  />
                )}
                {stages.slice(1).map((stage) => (
                  <ReferenceLine
                    key={stage.startsOn}
                    x={stage.start}
                    stroke="var(--border)"
                    strokeDasharray="3 4"
                  />
                ))}
                {checkpoints.map((c) => (
                  <ReferenceLine
                    key={`${c.weekStart}:${c.date}`}
                    x={timelineTime(c.date)}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="1 5"
                    className="forecast-checkpoint"
                    label={
                      checkpointLabels
                        ? {
                            value: "Check-in",
                            position: "insideTopRight",
                            fill: "var(--muted-foreground)",
                            fontSize: 10,
                            angle: -90,
                          }
                        : undefined
                    }
                  />
                ))}
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={[first, last]}
                  allowDataOverflow
                  interval={0}
                  ticks={visibleTicks.map((t) => t.time)}
                  tick={({ x, y, payload }) => {
                    const tick = ticks.find(
                      (t) => t.time === Number(payload?.value),
                    );
                    if (!tick) return <g />;
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <text
                          textAnchor={
                            tick.time === first
                              ? "start"
                              : tick.time === last
                                ? "end"
                                : "middle"
                          }
                          fill="var(--muted-foreground)"
                          fontSize={11}
                        >
                          {tick.endpoint ? (
                            <tspan x={0} y={48}>
                              Plan end ·{" "}
                              {chartDateLabel(
                                tick.time,
                                undefined,
                                startsOn.slice(0, 4) !== endsOn.slice(0, 4),
                              )}
                            </tspan>
                          ) : (
                            <>
                              <tspan x={0} y={14}>
                                Week {tick.week}
                              </tspan>
                              <tspan x={0} y={30}>
                                {chartDateLabel(tick.time)}
                              </tspan>
                            </>
                          )}
                        </text>
                      </g>
                    );
                  }}
                  tickLine={false}
                  axisLine={false}
                  height={xAxisHeight}
                />
                <YAxis
                  domain={[yMin, yMax]}
                  ticks={yTicks}
                  interval={0}
                  tick={() => <g />}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={chartLayout.yAxisWidth}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(label, payload) => {
                        const row = payload?.[0]?.payload as
                          | { date?: string; checkIns?: typeof checkpoints }
                          | undefined;
                        return (
                          <span>
                            {chartDateLabel(
                              label,
                              row?.date,
                              startsOn.slice(0, 4) !== endsOn.slice(0, 4),
                            )}
                            {row?.checkIns?.map((c) => (
                              <span className="checkpoint-tooltip" key={c.date}>
                                {c.label} · planned check-in
                              </span>
                            ))}
                          </span>
                        );
                      }}
                      formatter={(value, name) => (
                        <div className="forecast-tooltip-value">
                          <span>
                            {effectiveConfig[
                              name as keyof typeof effectiveConfig
                            ]?.label ?? name}
                          </span>
                          <strong>
                            {Array.isArray(value)
                              ? value.map((v) => Number(v).toFixed(1)).join("–")
                              : Number(value).toFixed(1)}{" "}
                            {unit}
                          </strong>
                        </div>
                      )}
                    />
                  }
                />
                {canRange && showRange && (
                  <Area
                    type="linear"
                    dataKey="range"
                    stroke="none"
                    fill="var(--color-range)"
                    fillOpacity={0.12}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                )}
                {goalValue !== undefined && (
                  <ReferenceLine
                    y={goalValue}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="3 6"
                    label={{
                      value: `Goal · ${goalValue.toFixed(1)} ${unit}`,
                      position: "insideBottomLeft",
                      fill: "var(--muted-foreground)",
                      className: "forecast-goal-label",
                    }}
                  />
                )}
                {referenceOn && (
                  <Line
                    dataKey="reference"
                    zIndex={seriesLayers.reference}
                    type="linear"
                    stroke="var(--color-reference)"
                    strokeWidth={2}
                    strokeDasharray="3 6"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                )}
                {variation.length > 0 && (
                  <Line
                    data={variation}
                    dataKey="illustration"
                    zIndex={seriesLayers.illustration}
                    type="linear"
                    stroke="var(--color-illustration)"
                    strokeOpacity="var(--component-comparison-variation-opacity)"
                    strokeWidth="var(--component-comparison-secondary-width)"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                    tooltipType="none"
                  />
                )}
                {projection.supported.map((id) => (
                  <Line
                    key={id}
                    type="linear"
                    dataKey={id}
                    zIndex={
                      selection === "mean"
                        ? seriesLayers.modelContext
                        : seriesLayers.prediction
                    }
                    stroke={"var(--color-" + id + ")"}
                    strokeWidth={
                      selection === "mean"
                        ? "var(--component-comparison-secondary-width)"
                        : "var(--component-comparison-primary-width)"
                    }
                    strokeOpacity={
                      selection === "mean"
                        ? "var(--component-comparison-secondary-opacity)"
                        : 1
                    }
                    strokeDasharray={selection === "mean" ? undefined : "6 4"}
                    dot={false}
                    activeDot={selection === "mean" ? false : { r: 4 }}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                ))}
                {selection === "mean" && (
                  <Line
                    dataKey="mean"
                    zIndex={seriesLayers.prediction}
                    type="linear"
                    stroke="var(--color-mean)"
                    strokeWidth="var(--component-comparison-primary-width)"
                    strokeDasharray="6 4"
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                )}
                <Line
                  dataKey="recorded"
                  zIndex={seriesLayers.measurements}
                  type="linear"
                  stroke="var(--color-recorded)"
                  strokeWidth="var(--component-comparison-actual-width)"
                  dot={{
                    r: 4,
                    fill: "var(--color-recorded)",
                    stroke: "var(--card)",
                    strokeWidth: 1,
                  }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ChartContainer>
          ) : (
            <div className="forecast-chart chart-no-output" role="status">
              No visible prediction or measurement for this measure and date
              range. Unavailable models are listed below.
            </div>
          )}
          {stages.length > 0 && onSelectPhase && selected && (
            <div
              className="phase-axis"
              style={{
                marginLeft: plotLeft,
                marginRight: chartLayout.right,
              }}
              role="group"
              aria-label="Journey phases along the forecast dates"
            >
              {stages.map((stage) => (
                <Button
                  key={stage.startsOn}
                  variant="ghost"
                  className="phase-segment"
                  style={{ left: `${stage.left}%`, width: `${stage.width}%` }}
                  aria-pressed={stage.startsOn === selected.startsOn}
                  aria-controls="phase-focus"
                  aria-label={`Phase ${stage.number}: ${stage.label}, ${formatDate(stage.startsOn)} to ${formatDate(stage.endsOn)}`}
                  title={stage.label}
                  onClick={() => onSelectPhase(stage.startsOn)}
                >
                  <span className="phase-segment-line" aria-hidden />
                  <span className="phase-segment-label">
                    Phase {stage.number}
                  </span>
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
      {projection.outsideMeasurementDates.length > 0 && (
        <p className="chart-status">
          {projection.outsideMeasurementDates.length} measurement dates outside
          this chart range. Saved records are unchanged.
        </p>
      )}
      {variation.length > 0 && (
        <p className="forecast-variation-caption">
          AM/PM fluctuation · illustration only
        </p>
      )}
      {selection === "mean" && availableModels.length === 1 && (
        <p className="chart-status" role="status">
          Only one model is available; the mean equals that model.
        </p>
      )}
      {selection === "mean" &&
        availableModels.length > 0 &&
        !rows.some((r) => r.mean != null) && (
          <p className="chart-status" role="status">
            No shared model values in this date range. Choose a model to inspect
            its own output.
          </p>
        )}
      {selection !== "mean" && !visibleModels.length && (
        <p className="chart-status" role="status">
          Your selected model is unavailable. Choose another comparison; your
          saved default is kept.
        </p>
      )}
      <ForecastLegend
        metric={metric}
        hasMeasurements={rows.some((r) => r.recorded != null)}
        states={states}
        selection={selection}
        meanModelCount={availableModels.length}
        defaultSelection={defaultSelection}
        onSelect={(value) =>
          setSelections((previous) => ({ ...previous, [metric]: value }))
        }
        onPin={
          onPinSelection
            ? () => {
                onPinSelection(selection);
              }
            : undefined
        }
      />
      {checkpoints.length > 0 && (
        <Disclosure title={`Planned check-ins · ${checkpoints.length} dates`}>
          <p className="field-hint">
            Invitations to record a measurement, not completed check-ins. All
            dates remain available in Whole journey and weekly detail.
          </p>
          <div
            className="forecast-checkin-list"
            tabIndex={0}
            role="region"
            aria-label="All planned check-in dates"
          >
            <ol>
              {checkpoints.map((c) => (
                <li key={`${c.weekStart}:${c.date}`}>
                  <strong>
                    {chartDateLabel(
                      c.date,
                      undefined,
                      startsOn.slice(0, 4) !== endsOn.slice(0, 4),
                    )}
                  </strong>{" "}
                  · {c.label}
                </li>
              ))}
            </ol>
          </div>
        </Disclosure>
      )}
      {selected &&
        onSelectPhase &&
        (showPhaseGuidance ? (
          <PhaseFocus
            phase={selected}
            number={selected.number}
            total={phases.length}
            canPrevious={selectedIndex > 0}
            canNext={selectedIndex < stages.length - 1}
            onPrevious={() => onSelectPhase(stages[selectedIndex - 1].startsOn)}
            onNext={() => onSelectPhase(stages[selectedIndex + 1].startsOn)}
          />
        ) : (
          <p id="phase-focus" role="status">
            Phase guidance is paused until the current information has been
            reviewed.
          </p>
        ))}
      <figcaption className="sr-only">
        Comparing {forecastSelectionLabel(selection)} with actual measurements.{" "}
        {selection === "mean"
          ? `The mean uses ${projection.meanModels.length} applicable models on shared dates. `
          : ""}
        {states.map((s) => `${MODEL_LABELS[s.id]}: ${s.status}`).join("; ")}.
        Actual measurements are reported values. Only the Hall reference is
        offered for comparison.{" "}
        {checkpoints
          .map((c) => `Planned check-in ${c.date}: ${c.label}`)
          .join("; ")}
      </figcaption>
    </figure>
  );
}
