// ABOUTME: Goal presentation uses dated Hall points and reported measurements, not UI arithmetic or inferred adherence.
// ABOUTME: Synthetic output edits isolate projection rules; controller cases separately exercise the real deterministic calculator.
import assert from "node:assert/strict";
import test, { before } from "node:test";
import { selectGoalProgress } from "../src/application/goal-progress-view";
import type { Session } from "../src/application/session";
import type {
  GoalOutlookView,
  MeasurementView,
} from "../src/application/goal-progress-contract";
import {
  addDays,
  daysBetween,
  type DailyObservation,
} from "../src/domain/facts";
import type { ModelPoint } from "../src/domain/forecast";
import { GOAL_TOLERANCE } from "../src/planning/goal-policy";
import {
  fictionalInput,
  FIXTURE_DATE,
  journeyHarness,
} from "./support/journey-fixtures";

let initial: Session;
before(async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  initial = structuredClone(h.state);
});
const copy = () => structuredClone(initial);
const forecast = (s: Session) => s.snapshot!.forecast!;
const hall = (s: Session) =>
  forecast(s).modelResults.find((m) => m.id === "hall")!;
const end = (s: Session) => s.journey.acceptances.at(-1)!.reference.targetDate;
function ready(value: GoalOutlookView) {
  assert.equal(value.status, "ready");
  return value;
}
function unknown(
  value: GoalOutlookView,
  reason: Extract<GoalOutlookView, { status: "unknown" }>["reason"],
) {
  assert.equal(value.status, "unknown");
  assert.equal(value.reason, reason);
  assert.equal("assessment" in value, false);
  assert.equal("projectedAtGoalDate" in value, false);
  return value;
}
function available(value: MeasurementView) {
  assert.equal(value.status, "available");
  return value;
}
function trajectory(
  s: Session,
  values: (
    date: string,
  ) => Partial<Pick<ModelPoint, "weightKg" | "bodyFatPct">>,
) {
  hall(s).current = hall(s).current.map((p) => {
    const next = { ...p, ...values(p.date) };
    if (next.bodyFatPct !== null) {
      next.fatMassKg = (next.weightKg * next.bodyFatPct) / 100;
      next.fatFreeMassKg = next.weightKg - next.fatMassKg;
    }
    return next;
  });
}
function observation(
  date: string,
  weightKg: number | null,
  percent: number | null,
  notes = "",
): DailyObservation {
  return {
    date,
    weightKg,
    bodyFat: percent === null ? null : { percent, method: "dxa" },
    notes,
    intake: null,
    activity: null,
    steps: null,
  };
}
function asOf(s: Session, date: string) {
  s.snapshot!.asOfDate = date;
  forecast(s).asOfDate = date;
  if (forecast(s).conditioning) forecast(s).conditioning!.cutoff = date;
}
function horizon(s: Session, date: string) {
  const f = forecast(s);
  for (const m of f.modelResults) {
    if (m.status !== "ok") continue;
    const extend = (points: ModelPoint[]) => {
      const kept = points.filter((p) => p.date <= date).map((p) => ({ ...p }));
      while (kept.at(-1)!.date < date)
        kept.push({ ...kept.at(-1)!, date: addDays(kept.at(-1)!.date, 1) });
      return kept;
    };
    m.current = extend(m.current);
    m.accepted = extend(m.accepted);
    m.sensitivity = {
      lower: extend(m.sensitivity.lower),
      upper: extend(m.sensitivity.upper),
    };
  }
  f.projectionDate = date;
}

test("summary separates the original request, whole accepted period and original reported baseline", () => {
  const s = copy(),
    v = selectGoalProgress(s, FIXTURE_DATE);
  assert.deepEqual(v.summary.goal, s.goal);
  assert.deepEqual(v.summary.period, {
    startsOn: FIXTURE_DATE,
    endsOn: end(s),
    endSource: "user_requested",
    durationDays: daysBetween(FIXTURE_DATE, end(s)),
  });
  assert.deepEqual(v.summary.activePlanPeriod, {
    startsOn: FIXTURE_DATE,
    endsOn: end(s),
  });
  assert.deepEqual(v.baseline, {
    status: "available",
    reading: { metric: "weight", value: 72, unit: "kg" },
    date: FIXTURE_DATE,
    source: "profile_report",
    method: null,
  });
  assert.deepEqual(v.latest, v.baseline);
});

test("a dated goal uses its exact date, not the last rolling endpoint or other models", () => {
  const s = copy(),
    goalDate = end(s),
    arrival = addDays(goalDate, 3);
  horizon(s, addDays(goalDate, 7));
  trajectory(s, (date) => ({ weightKg: date < arrival ? 69 : 68 }));
  // Deliberately misleading endpoint flag/order: only the dated Hall points are authoritative.
  forecast(s).goalOutcomes.current = true;
  forecast(s).modelResults.reverse();
  for (const m of forecast(s).modelResults.filter((m) => m.id !== "hall"))
    m.current = m.current.map((p) => ({ ...p, weightKg: 60 }));
  const out = ready(selectGoalProgress(s, FIXTURE_DATE).outlook);
  assert.deepEqual(out.projectedAtGoalDate, {
    date: goalDate,
    reading: { metric: "weight", value: 69, unit: "kg" },
  });
  assert.deepEqual(out.deviationAtGoalDate, {
    metric: "weight",
    value: 1,
    unit: "kg",
  });
  assert.equal(out.estimatedArrivalDate, arrival);
  assert.equal(out.arrivalDelayDays, 3);
  assert.equal(out.assessment, "needs_review");
});

for (const kind of ["weight", "body_fat"] as const) {
  for (const delta of [0, GOAL_TOLERANCE, GOAL_TOLERANCE + 0.01]) {
    test(`${kind}: existing tolerance controls assessment; zero deviation/delay survives (${delta})`, () => {
      const s = copy();
      s.goal.kind = kind;
      s.goal.value = kind === "weight" ? 68 : 28;
      trajectory(s, (date) =>
        kind === "weight"
          ? { weightKg: date === end(s) ? s.goal.value + delta : 72 }
          : { bodyFatPct: date === end(s) ? s.goal.value + delta : 32 },
      );
      const out = ready(selectGoalProgress(s, FIXTURE_DATE, kind).outlook);
      assert.equal(out.projectedAtGoalDate!.reading.metric, kind);
      assert.equal(
        out.projectedAtGoalDate!.reading.unit,
        kind === "weight" ? "kg" : "percent",
      );
      assert.equal(
        out.deviationAtGoalDate!.unit,
        kind === "weight" ? "kg" : "percentage_points",
      );
      assert.ok(Math.abs(out.deviationAtGoalDate!.value - delta) < 1e-12);
      assert.equal(
        out.assessment,
        delta <= GOAL_TOLERANCE ? "on_track" : "needs_review",
      );
      assert.equal(out.arrivalDelayDays, delta <= GOAL_TOLERANCE ? 0 : null);
    });
  }
}

test("baseline/latest use independently dated reports, skip note-only entries and never mutate ordering", () => {
  const s = copy(),
    today = addDays(FIXTURE_DATE, 4);
  s.logs = [
    observation(addDays(FIXTURE_DATE, 3), 73, null),
    observation(addDays(FIXTURE_DATE, 5), 60, 20),
    observation(addDays(FIXTURE_DATE, 1), null, 31),
    observation(today, null, null, "A note"),
  ];
  const weight = selectGoalProgress(s, today, "weight"),
    fat = selectGoalProgress(s, today, "body_fat");
  assert.deepEqual(weight.latest, {
    status: "available",
    reading: { metric: "weight", value: 73, unit: "kg" },
    date: addDays(FIXTURE_DATE, 3),
    source: "observation",
    method: null,
  });
  assert.deepEqual(fat.latest, {
    status: "available",
    reading: { metric: "body_fat", value: 31, unit: "percent" },
    date: addDays(FIXTURE_DATE, 1),
    source: "observation",
    method: "dxa",
  });
  assert.equal(fat.baseline.status, "available");
  if (fat.baseline.status === "available")
    assert.equal(fat.baseline.method, "bia");
});

test("estimated initial body fat is not a measured baseline; body-fat-only check-ins do not invent weight", () => {
  const s = copy();
  s.profile.bodyFat = null;
  assert.equal(
    selectGoalProgress(s, FIXTURE_DATE, "body_fat").baseline.status,
    "not_recorded",
  );
  assert.equal(
    selectGoalProgress(s, FIXTURE_DATE, "body_fat").latest.status,
    "not_recorded",
  );
  s.logs = [observation(FIXTURE_DATE, null, 30)];
  assert.equal(
    available(selectGoalProgress(s, FIXTURE_DATE, "body_fat").latest).source,
    "observation",
  );
  assert.deepEqual(
    available(selectGoalProgress(s, FIXTURE_DATE, "weight").latest).reading,
    { metric: "weight", value: 72, unit: "kg" },
  );
});

test("goal assessment keeps the goal metric when the display metric changes", () => {
  const s = copy();
  trajectory(s, () => ({ weightKg: 68 }));
  assert.deepEqual(
    selectGoalProgress(s, FIXTURE_DATE, "weight").outlook,
    selectGoalProgress(s, FIXTURE_DATE, "body_fat").outlook,
  );
});

for (const which of [
  "source_revision",
  "snapshot_date",
  "forecast_date",
  "cutoff",
  "baseline",
  "target_date",
] as const) {
  test(`stale ${which} never receives a success assessment`, () => {
    const s = copy();
    if (which === "source_revision") s.sourceRevision++;
    if (which === "snapshot_date")
      s.snapshot!.asOfDate = addDays(FIXTURE_DATE, -1);
    if (which === "forecast_date")
      forecast(s).asOfDate = addDays(FIXTURE_DATE, -1);
    if (which === "cutoff")
      forecast(s).conditioning!.cutoff = addDays(FIXTURE_DATE, -1);
    if (which === "baseline")
      forecast(s).baselineDate = addDays(FIXTURE_DATE, 1);
    if (which === "target_date") forecast(s).targetDate = addDays(end(s), 1);
    const out = unknown(selectGoalProgress(s, FIXTURE_DATE).outlook, "stale");
    assert.equal(out.binding.sourceRevision, s.sourceRevision);
    assert.equal(
      out.binding.snapshotSourceRevision,
      s.snapshot!.sourceRevision,
    );
    assert.equal(
      out.binding.acceptedJourneyId,
      s.journey.acceptances.at(-1)!.id,
    );
    assert.equal(out.binding.inputHash, forecast(s).inputHash);
  });
}

for (const status of ["paused", "needs_confirmation"] as const) {
  test(`scope/measurement state ${status} cannot become a green forecast`, () => {
    const s = copy();
    s.snapshot!.decision.status = status;
    unknown(selectGoalProgress(s, FIXTURE_DATE).outlook, "scope_withheld");
  });
}

test("Hall failure cannot fall back to a comparison model", () => {
  const s = copy();
  hall(s).status = "failed";
  hall(s).error = "Unsupported state";
  hall(s).current = [];
  unknown(selectGoalProgress(s, FIXTURE_DATE).outlook, "model_failed");
});

test("missing and unsupported output remain explicit", () => {
  const noForecast = copy();
  noForecast.snapshot!.forecast = null;
  unknown(selectGoalProgress(noForecast, FIXTURE_DATE).outlook, "no_forecast");
  const noBodyFat = copy();
  noBodyFat.goal.kind = "body_fat";
  noBodyFat.goal.value = 28;
  trajectory(noBodyFat, () => ({ bodyFatPct: null }));
  unknown(selectGoalProgress(noBodyFat, FIXTURE_DATE).outlook, "unsupported");
});

test("a goal date outside the actual computed range cannot use a substitute endpoint", () => {
  const s = copy();
  horizon(s, addDays(end(s), -7));
  unknown(selectGoalProgress(s, FIXTURE_DATE).outlook, "outside_horizon");
});

test("expired dates are explicit even after a fresh rolling forecast is calculated", () => {
  const s = copy(),
    today = addDays(end(s), 1);
  horizon(s, addDays(today, 28));
  asOf(s, today);
  const out = unknown(selectGoalProgress(s, today).outlook, "outside_horizon");
  assert.match(out.message, /passed|elapsed/i);
});

test("arrival search ignores a past crossing and evaluates the target date even after a future rebound", () => {
  const s = copy(),
    today = addDays(FIXTURE_DATE, 7);
  asOf(s, today);
  trajectory(s, (date) => ({
    weightKg: date < today || date === addDays(today, 2) ? 68 : 72,
  }));
  const out = ready(selectGoalProgress(s, today).outlook);
  assert.equal(out.estimatedArrivalDate, addDays(today, 2));
  assert.equal(out.assessment, "needs_review");
  assert.equal(out.arrivalDelayDays, daysBetween(end(s), addDays(today, 2)));
});

test("an undated goal exposes a bounded estimate, not a deadline or delay", () => {
  const s = copy(),
    arrival = addDays(FIXTURE_DATE, 21);
  s.goal.requestedDate = null;
  trajectory(s, (date) => ({ weightKg: date < arrival ? 72 : 68 }));
  const view = selectGoalProgress(s, FIXTURE_DATE),
    out = ready(view.outlook);
  assert.equal(view.summary.period!.endSource, "calculator_estimate");
  assert.equal(view.summary.goal.requestedDate, null);
  assert.equal(out.estimatedArrivalDate, arrival);
  assert.equal(out.projectedAtGoalDate, null);
  assert.equal(out.deviationAtGoalDate, null);
  assert.equal(out.arrivalDelayDays, null);
  assert.equal(out.evaluatedThrough, forecast(s).projectionDate);
});

test("no arrival inside an undated horizon is unknown, not an invented later date", () => {
  const s = copy();
  s.goal.requestedDate = null;
  trajectory(s, () => ({ weightKg: 72 }));
  unknown(selectGoalProgress(s, FIXTURE_DATE).outlook, "outside_horizon");
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}
test("the projection accepts frozen input and cannot rewrite histories, raw facts or model points", () => {
  const s = deepFreeze(copy()),
    before = JSON.stringify(s);
  selectGoalProgress(s, FIXTURE_DATE, "weight");
  selectGoalProgress(s, FIXTURE_DATE, "body_fat");
  assert.equal(JSON.stringify(s), before);
});

test("real controller replacement keeps the first start and changes the anchor only after acceptance", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  const original = selectGoalProgress(h.state, FIXTURE_DATE).summary;
  const today = addDays(FIXTURE_DATE, 7),
    revisedEnd = addDays(end(h.state), 14);
  h.setToday(today);
  await h.controller.proposeRevision({ targetDate: revisedEnd, mode: "loss" });
  assert.deepEqual(selectGoalProgress(h.state, today).summary, original);
  unknown(selectGoalProgress(h.state, today).outlook, "stale");
  await h.controller.accept();
  const view = selectGoalProgress(h.state, today);
  assert.equal(view.summary.goal.requestedDate, original.goal.requestedDate);
  assert.deepEqual(view.summary.period, {
    ...original.period!,
    endsOn: revisedEnd,
    endSource: "accepted_revision",
    durationDays: daysBetween(FIXTURE_DATE, revisedEnd),
  });
  assert.deepEqual(view.summary.activePlanPeriod, {
    startsOn: today,
    endsOn: revisedEnd,
  });
  assert.equal(ready(view.outlook).projectedAtGoalDate!.date, revisedEnd);
});

test("unaccepted first generation cannot be presented as an active goal period", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  const view = selectGoalProgress(h.state, FIXTURE_DATE);
  assert.equal(view.summary.period, null);
  assert.equal(view.summary.activePlanPeriod, null);
  unknown(view.outlook, "no_forecast");
});

test("an original requested date remains the anchor when a different system horizon was accepted", () => {
  const s = copy(),
    requested = addDays(FIXTURE_DATE, 14);
  s.goal.requestedDate = requested;
  trajectory(s, (date) => ({ weightKg: date === requested ? 69 : 68 }));
  const v = selectGoalProgress(s, FIXTURE_DATE),
    out = ready(v.outlook);
  assert.equal(v.summary.period!.endSource, "calculator_estimate");
  assert.equal(v.summary.period!.endsOn, end(s));
  assert.equal(out.projectedAtGoalDate!.date, requested);
  assert.equal(out.projectedAtGoalDate!.reading.value, 69);
  assert.equal(out.assessment, "needs_review");
});

test("an undated missing metric is unsupported rather than a guessed arrival", () => {
  const s = copy();
  s.goal = { ...s.goal, requestedDate: null, kind: "body_fat", value: 28 };
  trajectory(s, () => ({ bodyFatPct: null }));
  unknown(selectGoalProgress(s, FIXTURE_DATE).outlook, "unsupported");
});

test("a successful Hall output remains usable when comparison models fail", () => {
  const s = copy();
  for (const m of forecast(s).modelResults.filter((m) => m.id !== "hall")) {
    m.status = "failed";
    m.error = "Comparison unavailable";
    m.current = [];
  }
  assert.equal(
    ready(selectGoalProgress(s, FIXTURE_DATE).outlook).model,
    "hall",
  );
});

test("a same-day correction affects latest while preserving the original baseline", () => {
  const s = copy();
  s.logs = [observation(FIXTURE_DATE, 73, 31)];
  const v = selectGoalProgress(s, FIXTURE_DATE);
  assert.equal(available(v.baseline).reading.value, 72);
  assert.equal(available(v.latest).reading.value, 73);
  assert.equal(available(v.baseline).source, "profile_report");
  assert.equal(available(v.latest).source, "observation");
});

test("the first accepted plan start does not masquerade as the baseline measurement date", async () => {
  const h = journeyHarness(),
    start = addDays(FIXTURE_DATE, 7);
  h.setToday(start);
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  const v = selectGoalProgress(h.state, start);
  assert.equal(v.summary.period!.startsOn, start);
  assert.equal(available(v.baseline).date, FIXTURE_DATE);
  assert.equal(
    v.summary.period!.durationDays,
    daysBetween(start, end(h.state)),
  );
});

test("real undated calculation remains an estimate and never acquires a user deadline", async () => {
  const h = journeyHarness(),
    input = fictionalInput();
  input.goal.requestedDate = null;
  await h.controller.start(input, true);
  await h.controller.accept();
  const v = selectGoalProgress(h.state, FIXTURE_DATE),
    out = ready(v.outlook);
  assert.equal(v.summary.goal.requestedDate, null);
  assert.equal(v.summary.period!.endSource, "calculator_estimate");
  assert.equal(out.projectedAtGoalDate, null);
  assert.ok(
    out.estimatedArrivalDate !== null &&
      out.estimatedArrivalDate <= out.evaluatedThrough,
  );
});

test("real saved joint measurement feeds the projection without rewriting targets or triggering new calls", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  const today = addDays(FIXTURE_DATE, 7),
    acceptedTargets = structuredClone(h.state.targetRevisions);
  h.setToday(today);
  await h.controller.updateMeasurement({
    date: today,
    weightKg: 73,
    bodyFat: { percent: 31, method: "dxa" },
    notes: "Fictional projection test.",
  });
  const before = JSON.stringify(h.state),
    calls = h.calls.length,
    calculations = h.calculations.length;
  const weight = selectGoalProgress(h.state, today),
    fat = selectGoalProgress(h.state, today, "body_fat");
  assert.equal(available(weight.latest).reading.value, 73);
  assert.equal(available(fat.latest).reading.value, 31);
  const out = ready(weight.outlook),
    p = hall(h.state).current.find((p) => p.date === end(h.state))!;
  assert.equal(out.projectedAtGoalDate!.reading.value, p.weightKg);
  assert.equal(out.binding.sourceRevision, h.state.sourceRevision);
  assert.equal(out.binding.inputHash, forecast(h.state).inputHash);
  assert.deepEqual(h.state.targetRevisions, acceptedTargets);
  assert.equal(h.calls.length, calls);
  assert.equal(h.calculations.length, calculations);
  assert.equal(JSON.stringify(h.state), before);
});

test("a note-only save keeps existing numerical validity and does not invent a latest measurement", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  const inputHash = forecast(h.state).inputHash,
    calculations = h.calculations.length;
  await h.controller.updateMeasurement({
    date: FIXTURE_DATE,
    weightKg: null,
    bodyFat: null,
    notes: "Fictional note for projection tests.",
  });
  const v = selectGoalProgress(h.state, FIXTURE_DATE);
  assert.equal(ready(v.outlook).binding.inputHash, inputHash);
  assert.equal(available(v.latest).source, "profile_report");
  assert.equal(h.calculations.length, calculations);
});

test("changing the session-local date expires the previous forecast and invalid date arguments are rejected", () => {
  const s = copy();
  unknown(selectGoalProgress(s, addDays(FIXTURE_DATE, 1)).outlook, "stale");
  assert.throws(() => selectGoalProgress(s, "2026-02-30"));
  assert.throws(() => selectGoalProgress(s, "2026-06-01T23:00:00Z"));
});

test("real expired calculation retains a future rolling range without presenting the old deadline as attainable", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  const deadline = end(h.state),
    today = addDays(deadline, 1);
  h.setToday(today);
  await h.controller.recalculate();
  assert.ok(forecast(h.state).projectionDate > today);
  assert.equal(forecast(h.state).targetDate, deadline);
  assert.match(
    unknown(selectGoalProgress(h.state, today).outlook, "outside_horizon")
      .message,
    /passed|elapsed/i,
  );
});

test("real body-fat goal and body-fat-only update keep model weight separate from a scale report", async () => {
  const h = journeyHarness(),
    input = fictionalInput();
  input.goal = { ...input.goal, kind: "body_fat", value: 30 };
  await h.controller.start(input, true);
  await h.controller.accept();
  const today = addDays(FIXTURE_DATE, 7);
  h.setToday(today);
  await h.controller.updateMeasurement({
    date: today,
    weightKg: null,
    bodyFat: { percent: 31.5, method: "bia" },
    notes: "Fictional body-fat-only check-in.",
  });
  const view = selectGoalProgress(h.state, today, "weight"),
    out = ready(view.outlook);
  assert.equal(available(view.latest).date, FIXTURE_DATE);
  assert.equal(available(view.latest).source, "profile_report");
  assert.equal(out.projectedAtGoalDate!.reading.metric, "body_fat");
  assert.equal(out.projectedAtGoalDate!.reading.unit, "percent");
  assert.equal(
    out.projectedAtGoalDate!.reading.value,
    hall(h.state).current.find((p) => p.date === end(h.state))!.bodyFatPct,
  );
  assert.equal(
    available(selectGoalProgress(h.state, today, "body_fat").latest).date,
    today,
  );
});

test("a guidance-only accepted replacement retains date provenance and the whole period", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  const original = selectGoalProgress(h.state, FIXTURE_DATE).summary,
    today = addDays(FIXTURE_DATE, 7);
  h.setToday(today);
  await h.controller.proposeRevision(null, {
    priorities: ["fewer_actions"],
    availableTrainingMinutes: null,
    requestedGoalDate: null,
    notes: "Fictional test: keep one lunch choice.",
  });
  await h.controller.accept();
  const v = selectGoalProgress(h.state, today);
  assert.deepEqual(v.summary.period, original.period);
  assert.equal(v.summary.activePlanPeriod!.startsOn, today);
  assert.equal(v.summary.period!.endSource, "user_requested");
});

test("an absent Hall model and non-finite goal output cannot receive an assessment", () => {
  const missing = copy();
  forecast(missing).modelResults = forecast(missing).modelResults.filter(
    (m) => m.id !== "hall",
  );
  unknown(selectGoalProgress(missing, FIXTURE_DATE).outlook, "model_failed");
  const broken = copy();
  trajectory(broken, () => ({ weightKg: Number.NaN }));
  unknown(selectGoalProgress(broken, FIXTURE_DATE).outlook, "unsupported");
});

test("unknown numerical-history association is withheld, and a missing draft cannot invent a period", () => {
  const wrongGoal = copy();
  wrongGoal.targetRevisions[0].goalId = "a-different-goal";
  unknown(
    selectGoalProgress(wrongGoal, FIXTURE_DATE).outlook,
    "scope_withheld",
  );
  const missing = copy();
  missing.journey.drafts = [];
  const v = selectGoalProgress(missing, FIXTURE_DATE);
  assert.equal(v.summary.period, null);
  assert.equal(v.summary.activePlanPeriod, null);
  unknown(v.outlook, "no_forecast");
});
