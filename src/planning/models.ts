// ABOUTME: Version-pinned Hall, PBRC 2018 reference and Antonetti 2022 numerical adapters.
// ABOUTME: All adapters share dated forcing; PBRC reference drift is retained and disclosed.
import type { ProfileFacts } from "../domain/facts";
import type { BaselineEstimate, ModelPoint, ModelId } from "../domain/forecast";
import { runHall } from "./hall";
import { addDays } from "../domain/facts";
import {
  ModelCheckpointSchema,
  validateModelMeasurements,
  fatForStructuralMass,
  type ModelCheckpoint,
  type ModelMeasurement,
  type ModelConditioningEvent,
} from "../domain/model-state";
export const MODEL_REGISTRY = {
  hall: {
    name: "Hall",
    equationVersion: "hall-lancet-2011-insp-698ff71",
    implementationVersion: "adaptive-hall-3",
    composition: true,
    source:
      "https://github.com/INSP-RH/bw/tree/698ff71d037e778ac4fd8eb71039cbc941e2d758",
  },
  thomas: {
    name: "Thomas / Pennington",
    equationVersion: "pbrc-author-vba-2018",
    implementationVersion: "adaptive-pbrc-2",
    composition: true,
    source: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9114632/",
  },
  antonetti: {
    name: "Antonetti",
    equationVersion: "antonetti-modified-2022",
    implementationVersion: "adaptive-antonetti-2",
    composition: false,
    source: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9691568/",
  },
} as const;
export interface SimulationInput {
  profile: ProfileFacts;
  baseline: BaselineEstimate;
  dates: string[];
  intakes: number[];
  activityDeltas: number[];
  measurements?: ModelMeasurement[];
  resume?: ModelCheckpoint;
}
export function simulateModel(
  id: ModelId,
  input: SimulationInput,
): {
  points: ModelPoint[];
  diagnostics: string[];
  parameters: Record<string, string | number>;
  checkpoints: ModelCheckpoint[];
  events: ModelConditioningEvent[];
} {
  const { profile: p, baseline: b, dates, intakes, activityDeltas } = input;
  if (
    !dates.length ||
    intakes.length !== dates.length - 1 ||
    activityDeltas.length !== intakes.length ||
    intakes.some((x) => !Number.isFinite(x) || x < 0) ||
    activityDeltas.some((x) => !Number.isFinite(x))
  )
    throw new Error("Invalid dated model inputs.");
  if (dates.some((d, i) => d !== addDays(p.startDate, i)) || dates.length > 366)
    throw new Error(
      "Model dates must be continuous from the original baseline.",
    );
  const measurements = input.measurements ?? [];
  validateModelMeasurements(measurements, dates.length - 1);
  const seed = JSON.stringify({ profile: p, baseline: b });
  const resumed = input.resume
    ? ModelCheckpointSchema.parse(input.resume)
    : null;
  if (
    resumed &&
    (resumed.model !== id ||
      (id !== "hall" && resumed.seed !== seed) ||
      resumed.day >= dates.length)
  )
    throw new Error(
      "The checkpoint does not belong to this model, baseline or horizon.",
    );
  const checkpoints: ModelCheckpoint[] = [],
    events: ModelConditioningEvent[] = [];
  const observation = (day: number) =>
    measurements.find((m) => m.day === day && (!resumed || day > resumed.day));
  const eventFor = (
    m: ModelMeasurement,
    prior: ModelPoint,
  ): ModelConditioningEvent => ({
    day: m.day,
    status: "unchanged",
    kind:
      m.weightKg === null
        ? "body_fat"
        : m.bodyFatPct === null
          ? "weight"
          : "joint",
    method: m.method,
    priorWeightKg: prior.weightKg,
    priorBodyFatPct: prior.bodyFatPct,
    observedWeightKg: m.weightKg,
    observedBodyFatPct: m.bodyFatPct,
    estimatedWeightUsed: m.weightKg === null,
    explanation:
      "The supported measurement equals the model state; continuation is unchanged.",
  });
  if (id === "hall") {
    const run = runHall(
      {
        ...p,
        pal: b.pal,
        bodyFatPct: b.bodyFatPct,
        initialTdeeKcal: b.tdeeKcal,
        days: dates.length - 1,
        intakeKcal: intakes,
        activityDelta: activityDeltas,
        intakeTiming: "whole-day",
      },
      measurements,
      input.resume,
    );
    return {
      points: run.points.map((v) => ({
        date: dates[v.day],
        weightKg: v.weightKg,
        fatMassKg: v.fatMassKg,
        fatFreeMassKg: v.fatFreeMassKg,
        bodyFatPct: v.bodyFatPct,
        expenditureKcal: v.maintenanceKcal,
      })),
      checkpoints: run.checkpoints,
      events: run.events,
      diagnostics: [],
      parameters: {
        initialTdeeKcal: b.tdeeKcal,
        initialFatMassKg: b.fatMassKg,
        pal: b.pal,
        carbohydrateShare: 0.5,
        sodiumChange: 0,
      },
    };
  }
  if (id === "antonetti") {
    const gamma =
      -6.25 * p.heightCm +
      5 * p.ageYears -
      166 * (p.sex === "male" ? 1 : 0) +
      161;
    const m0 = (0.9 * b.tdeeKcal - 10 * p.weightKg + gamma) / p.weightKg;
    let w = resumed?.model === "antonetti" ? resumed.weight : p.weightKg;
    const point = (i: number): ModelPoint => ({
      date: dates[i],
      weightKg: w,
      fatMassKg: null,
      fatFreeMassKg: null,
      bodyFatPct: null,
      expenditureKcal: null,
    });
    const points: ModelPoint[] = [];
    for (let i = resumed?.day ?? 0; i <= intakes.length; i++) {
      const measured = observation(i);
      if (measured) {
        const event = eventFor(measured, point(i));
        if (measured.weightKg === null) {
          event.status = "not_supported";
          event.estimatedWeightUsed = false;
          event.explanation =
            "Antonetti has no body-composition state; body-fat-only observations do not change it.";
        } else if (Math.abs(measured.weightKg - w) > 1e-10) {
          w = measured.weightKg;
          event.status = "applied";
          event.explanation =
            "Weight state updated; original coefficients are retained and no body fat is inferred.";
        }
        events.push(event);
      }
      points.push(point(i));
      checkpoints.push({
        version: 1,
        model: "antonetti",
        day: i,
        seed,
        weight: w,
      });
      if (i === intakes.length) break;
      const m = m0 + activityDeltas[i],
        alpha = -(m + 10) / 7700,
        beta = (0.9 * intakes[i] + gamma) / 7700;
      w =
        Math.abs(alpha) < 1e-12
          ? w + beta
          : -beta / alpha + (w + beta / alpha) * Math.exp(alpha);
      if (!Number.isFinite(w) || w <= 0)
        throw new Error("Antonetti left its numerical range.");
    }
    return {
      points,
      checkpoints,
      events,
      diagnostics: [
        "Body composition is not an output of this model.",
        "Daily activity changes are an application forcing extension; no exercise-calorie inference is made from checkmarks.",
      ],
      parameters: {
        initialTdeeKcal: b.tdeeKcal,
        m0,
        effectiveEnergyDensityKcalPerKg: 7700,
      },
    };
  }
  const a = p.sex === "male" ? 293 : 248,
    power = p.sex === "male" ? 0.433 : 0.4356,
    y = p.sex === "male" ? 5.92 : 5.09;
  const rmr0 = a * p.weightKg ** power - y * p.ageYears,
    neat0 = 0.326 * b.tdeeKcal,
    dit0 = 0.075 * b.tdeeKcal;
  const pa0 = Math.max(0, b.tdeeKcal - dit0 - neat0 - rmr0),
    m0 = pa0 / p.weightKg,
    constant = neat0 - 2 * (rmr0 + pa0 + dit0);
  let logC =
    resumed?.model === "thomas"
      ? resumed.logC
      : Math.log(b.fatMassKg) - (p.weightKg - b.fatMassKg) / 10.4;
  let f = resumed?.model === "thomas" ? resumed.fat : b.fatMassKg;
  const composition = (fat: number) => {
    if (fat <= 0) throw new Error("PBRC left its body-composition range.");
    const ffm = 10.4 * (Math.log(fat) - logC);
    if (ffm <= 0) throw new Error("PBRC left its body-composition range.");
    return { ffm, w: ffm + fat };
  };
  const point = (i: number): ModelPoint => {
    const { ffm, w } = composition(f);
    return {
      date: dates[i],
      weightKg: w,
      fatMassKg: f,
      fatFreeMassKg: ffm,
      bodyFatPct: (f / w) * 100,
      expenditureKcal: null,
    };
  };
  const points: ModelPoint[] = [];
  for (let day = resumed?.day ?? 0; day <= intakes.length; day++) {
    const observed = observation(day);
    if (observed) {
      const prior = point(day),
        event = eventFor(observed, prior);
      try {
        if (
          (observed.weightKg !== null &&
            Math.abs(observed.weightKg - prior.weightKg) > 1e-10) ||
          (observed.bodyFatPct !== null &&
            Math.abs(observed.bodyFatPct - prior.bodyFatPct!) > 1e-10)
        ) {
          const weight = observed.weightKg ?? prior.weightKg;
          if (observed.bodyFatPct !== null) {
            const fat = (weight * observed.bodyFatPct) / 100,
              ffm = weight - fat;
            if (!(fat > 0 && ffm > 0))
              throw new Error(
                "No positive PBRC composition represents this observation.",
              );
            f = fat;
            logC = Math.log(fat) - ffm / 10.4;
          } else f = fatForStructuralMass(weight, f, composition(f).ffm);
          event.status = "applied";
          event.explanation =
            observed.weightKg === null
              ? "Body fat conditioned using model-estimated weight; no scale observation is created."
              : "Current composition conditioned with original resting, activity, NEAT and adaptation coefficients retained. Allocation is an application assumption.";
        }
      } catch (e) {
        event.status = "unsupported";
        event.explanation =
          e instanceof Error ? e.message : "Unsupported composition.";
      }
      events.push(event);
    }
    points.push(point(day));
    checkpoints.push({ version: 1, model: "thomas", day, seed, fat: f, logC });
    if (day === intakes.length) break;
    const m = m0 + activityDeltas[day];
    if (m < 0)
      throw new Error(
        "PBRC reference activity cannot represent this negative change from its initialized activity term.",
      );
    const rhs = (fat: number) => {
      const { w } = composition(fat);
      const rmr = a * w ** power - y * p.ageYears,
        dit = 0.075 * intakes[day],
        pa = m * w,
        neat = Math.max(0, 2 * (rmr + dit + pa) + constant),
        ee = 0.98 * rmr + dit + pa + neat;
      return (intakes[day] - ee) / ((10.4 * 1020) / fat + 9500);
    };
    const h = 0.25;
    for (let j = 0; j < 4; j++) {
      const k1 = rhs(f),
        k2 = rhs(f + (h * k1) / 2),
        k3 = rhs(f + (h * k2) / 2),
        k4 = rhs(f + h * k3);
      f += (h * (k1 + 2 * k2 + 2 * k3 + k4)) / 6;
    }
  }
  return {
    points,
    checkpoints,
    events,
    diagnostics: [
      "Author-reference 2% resting metabolic adaptation and nonnegative activity initialization are retained. Zero prescribed calorie reduction need not produce a flat trajectory.",
      "Shared estimated TDEE replaces the measured DLW TDEE required by the released reference; this and dated activity forcing are application adaptations.",
    ],
    parameters: {
      initialTdeeKcal: b.tdeeKcal,
      initialFatMassKg: b.fatMassKg,
      nativeRmrKcal: rmr0,
      initialActivityKcal: pa0,
      baselineBalanceDifferenceKcal: rmr0 + dit0 + neat0 + pa0 - b.tdeeKcal,
      restingAdaptation: 0.02,
      solverStepDays: 0.25,
    },
  };
}
