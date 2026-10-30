// ABOUTME: Frozen B-to-D chart input; canonical forecasts/observations remain owned by their existing contracts.
// ABOUTME: Rendering/zoom selection cannot mutate these inputs or add simulation to model results.
import type { DailyObservation, GoalSpec, ProfileFacts } from "../domain/facts";
import type { ForecastSnapshot } from "../domain/forecast";
import type { JourneyBinding } from "../domain/journey";
import type {
  ForecastViewBinding,
  GoalSummaryView,
} from "./goal-progress-contract";
import type { JourneyPhase } from "./journey-timeline";
import type { ForecastDisplay, ForecastSelection } from "./forecast-display";
export interface JourneyChartInput {
  binding: ForecastViewBinding;
  freshness: "current" | "stale" | "unavailable";
  guidanceWithheld: boolean;
  profile: ProfileFacts;
  goal: GoalSpec;
  period: NonNullable<GoalSummaryView["period"]>;
  activePlanPeriod: Pick<JourneyBinding, "startsOn" | "endsOn">;
  forecast: ForecastSnapshot | null;
  reference: ForecastSnapshot | null;
  observations: readonly DailyObservation[];
  phases: readonly JourneyPhase[];
  checkIns: readonly { weekStart: string; date: string; label: string }[];
}
export interface JourneyChartProps {
  input: JourneyChartInput;
  metric: GoalSpec["kind"];
  selectedPhase: string | null;
  onSelectPhase: (startsOn: string) => void;
  onMetricChange: (metric: GoalSpec["kind"]) => void;
  display?: ForecastDisplay;
  onPinSelection?: (
    metric: GoalSpec["kind"],
    selection: ForecastSelection,
  ) => boolean;
  onVariationChange?: (show: boolean) => boolean;
}
