// ABOUTME: Scalar TypeScript port of INSP-RH/bw's adult Hall model and split RK4 solver.
// ABOUTME: Preserve upstream coefficients/integration order; attribution is in THIRD_PARTY_NOTICES.md.
// Source: INSP-RH/bw commit 698ff71d037e778ac4fd8eb71039cbc941e2d758 (MIT).
import {
  ModelCheckpointSchema,
  fatForStructuralMass,
  validateModelMeasurements,
  type ModelCheckpoint,
  type ModelMeasurement,
  type ModelConditioningEvent,
} from "../domain/model-state";

export interface HallInput {
  ageYears: number;
  sex: "male" | "female";
  heightCm: number;
  weightKg: number;
  pal: number;
  intakeKcal: number | number[];
  days: number;
  bodyFatPct?: number;
  initialTdeeKcal?: number;
  activityDelta?: number[];
  /** Hold each whole-day diary total constant within its integration step. */
  intakeTiming?: "sampled" | "whole-day";
}
export interface HallPoint {
  day: number;
  weightKg: number;
  maintenanceKcal: number;
  fatMassKg: number;
  fatFreeMassKg: number;
  bodyFatPct: number;
}

const C = {
  rhoG: 4206.501,
  rhoF: 9440.727,
  rhoL: 1816.444,
  gammaF: 3.107075,
  gammaL: 21.98853,
  etaF: 179.2543,
  etaL: 229.4455,
  betaTEF: 0.1,
  betaAT: 0.14,
  tauAT: 14,
  sodium: 3220,
  zetaNa: 3000,
  zetaCI: 4000,
};
const partition = (10.4 * C.rhoL) / C.rhoF;

/** Upstream Mifflin coefficients, in kcal/day; height is converted from cm to m. */
export function restingEnergy(
  input: Pick<HallInput, "weightKg" | "heightCm" | "ageYears" | "sex">,
): number {
  return (
    9.99 * input.weightKg +
    (625 * input.heightCm) / 100 -
    4.92 * input.ageYears +
    (input.sex === "male" ? 5 : -161)
  );
}

/** Simulate daily scale weight; food sodium and carbohydrate fractions stay at baseline. */
export function hallForecast(input: HallInput): HallPoint[] {
  return runHall(input).points;
}

/** Continue original parameters and transient states, optionally conditioning start-of-day measurements. */
export function runHall(
  input: HallInput,
  observations: ModelMeasurement[] = [],
  resume?: ModelCheckpoint,
): {
  points: HallPoint[];
  checkpoints: ModelCheckpoint[];
  events: ModelConditioningEvent[];
} {
  const { ageYears: age, sex, weightKg: bw, days, pal } = input;
  if (!Number.isInteger(days) || days < 1 || days > 365)
    throw new Error("The forecast horizon must be 1–365 days.");
  if (
    ![age, bw, input.heightCm, pal].every(Number.isFinite) ||
    age < 18 ||
    bw <= 0 ||
    input.heightCm <= 0 ||
    pal < 1.4 ||
    pal > 2.4
  )
    throw new Error("Unsupported adult model inputs.");
  const ht = input.heightCm / 100;
  const rmr = restingEnergy(input);
  const baseline = input.initialTdeeKcal ?? rmr * pal;
  if (
    !Number.isFinite(baseline) ||
    baseline <= 0 ||
    (input.bodyFatPct !== undefined &&
      (!Number.isFinite(input.bodyFatPct) ||
        input.bodyFatPct <= 0 ||
        input.bodyFatPct >= 100)) ||
    input.activityDelta?.some((v) => !Number.isFinite(v))
  )
    throw new Error("Unsupported physiology or activity inputs.");
  const supplied = Array.isArray(input.intakeKcal)
    ? input.intakeKcal
    : [input.intakeKcal];
  if (
    !supplied.length ||
    supplied.some((value) => !Number.isFinite(value) || value < 0)
  )
    throw new Error("Observed energy intake must be nonnegative and finite.");
  let stepDay = 0;
  // Original-C++ fixtures retain the sampled convention. Whole-day records use a
  // zero-order hold so tomorrow's scenario cannot alter yesterday's state.
  const intake = (t: number) =>
    supplied[
      Math.min(
        input.intakeTiming === "whole-day" ? stepDay : Math.floor(t),
        supplied.length - 1,
      )
    ];
  const change = (t: number) => intake(t) - baseline;
  const ecf0 =
    sex === "male"
      ? 0.025 * age + 9.57 * ht + 0.191 * bw - 12.4
      : -4 + 5.98 * ht + 0.167 * bw;
  const referenceFat =
    (bw *
      (0.14 * age +
        (sex === "male" ? 37.31 : 39.96) * Math.log(bw / ht ** 2) -
        (sex === "male" ? 103.94 : 102.01))) /
    100;
  const f0 =
    input.bodyFatPct === undefined
      ? referenceFat
      : (bw * input.bodyFatPct) / 100;
  const l0 = bw - ecf0 - f0 - 3.7 * 0.5;
  if (f0 <= 0 || l0 <= 0)
    throw new Error("The model cannot initialize this body composition.");
  const delta = ((1 - C.betaTEF) * baseline - rmr) / bw;
  const activity = () => {
    const value =
      delta +
      (input.activityDelta?.[
        Math.min(stepDay, input.activityDelta.length - 1)
      ] ?? 0);
    if (value < 0)
      throw new Error("Activity change exceeds the model baseline.");
    return value;
  };
  const K = baseline - C.gammaL * l0 - C.gammaF * f0 - delta * bw;
  const cib = 0.5 * baseline;
  const kg = cib / 0.5 ** 2;
  const alpha1 = -(1 + C.etaL / C.rhoL) * partition;
  const alpha2 = -(1 + C.etaF / C.rhoF);
  let fatAnchor = f0,
    leanAnchor = l0;
  const fat = (lean: number) =>
    fatAnchor * Math.exp((C.rhoL * (lean - leanAnchor)) / (C.rhoF * partition));
  const dG = (t: number, gly: number) =>
    (0.5 * intake(t) - kg * gly ** 2) / C.rhoG;
  const dAT = (t: number, at: number) => (C.betaAT * change(t) - at) / C.tauAT;
  const dECF = (t: number, ecf: number) =>
    (-C.zetaNa * (ecf - ecf0) - C.zetaCI * (1 - (0.5 * intake(t)) / cib)) /
    C.sodium;
  const dLean = (
    t: number,
    lean: number,
    gly: number,
    at: number,
    ecf: number,
  ) => {
    const f = fat(lean);
    const w = lean + f + ecf + 3.7 * gly;
    const r3 =
      K +
      activity() * w +
      C.betaTEF * change(t) +
      at -
      intake(t) +
      C.rhoG * dG(t, gly);
    return (
      (((r3 + C.gammaL * lean + C.gammaF * f) / (alpha1 + alpha2 * f)) *
        partition) /
      C.rhoL
    );
  };
  const rk = (
    f: (t: number, value: number) => number,
    t: number,
    value: number,
  ) => {
    const a = f(t, value);
    const b = f(t + 0.5, value + 0.5 * a);
    const c = f(t + 0.5, value + 0.5 * b);
    const d = f(t + 1, value + c);
    return value + (a + 2 * b + 2 * c + d) / 6;
  };
  let at = 0,
    ecf = ecf0,
    gly = 0.5,
    lean = l0;
  validateModelMeasurements(observations, days);
  const seed = JSON.stringify({ age, sex, bw, ht, pal, baseline, f0 });
  if (resume) {
    const c = ModelCheckpointSchema.parse(resume);
    if (c.model !== "hall" || c.seed !== seed || c.day > days)
      throw new Error(
        "Hall checkpoint does not belong to these original parameters or dates.",
      );
    ({ at, ecf, gly, lean, fatAnchor, leanAnchor } = c);
  }
  const maintenance = () =>
    (K +
      activity() * (lean + fat(lean) + ecf + 3.7 * gly) +
      C.gammaL * lean +
      C.gammaF * fat(lean) +
      at -
      C.betaTEF * baseline) /
    (1 - C.betaTEF);
  const result: HallPoint[] = [],
    checkpoints: ModelCheckpoint[] = [],
    events: ModelConditioningEvent[] = [];
  for (let day = resume?.day ?? 0; day <= days; day++) {
    stepDay = Math.max(0, day - 1);
    const observed = observations.find(
      (v) => v.day === day && (!resume || day > resume.day),
    );
    if (observed) {
      const priorWeightKg = lean + fat(lean) + ecf + 3.7 * gly,
        priorBodyFatPct = (100 * fat(lean)) / priorWeightKg;
      const event: ModelConditioningEvent = {
        day,
        kind:
          observed.weightKg === null
            ? "body_fat"
            : observed.bodyFatPct === null
              ? "weight"
              : "joint",
        method: observed.method,
        priorWeightKg,
        priorBodyFatPct,
        observedWeightKg: observed.weightKg,
        observedBodyFatPct: observed.bodyFatPct,
        estimatedWeightUsed: observed.weightKg === null,
        status: "unchanged",
        explanation:
          "The supported measurement equals the model state; continuation is unchanged.",
      };
      try {
        if (
          (observed.weightKg !== null &&
            Math.abs(observed.weightKg - priorWeightKg) > 1e-10) ||
          (observed.bodyFatPct !== null &&
            Math.abs(observed.bodyFatPct - priorBodyFatPct) > 1e-10)
        ) {
          const w = observed.weightKg ?? priorWeightKg;
          if (observed.bodyFatPct !== null) {
            const f = (w * observed.bodyFatPct) / 100,
              l = w - f - ecf - 3.7 * gly;
            if (!(f > 0 && l > 0))
              throw new Error(
                "The measurement cannot retain positive Hall transient and structural states.",
              );
            fatAnchor = f;
            leanAnchor = l;
            lean = l;
          } else {
            const f = fatForStructuralMass(
              w - ecf - 3.7 * gly,
              fatAnchor,
              leanAnchor,
            );
            lean = leanAnchor + 10.4 * Math.log(f / fatAnchor);
          }
          event.status = "applied";
          event.explanation =
            observed.weightKg === null
              ? "Body fat conditioned using model-estimated weight; this does not create a scale observation."
              : "State conditioned while retaining water, glycogen, adaptation and original metabolic parameters. Structural allocation is an application assumption, not a measured cause.";
        }
      } catch (e) {
        event.status = "unsupported";
        event.explanation =
          e instanceof Error ? e.message : "Unsupported measurement.";
      }
      events.push(event);
    }
    const reconstructedWeight = lean + fat(lean) + ecf + 3.7 * gly;
    const weightKg =
      day === 0 && Math.abs(reconstructedWeight - bw) < 1e-10
        ? bw
        : reconstructedWeight;
    result.push({
      day,
      weightKg,
      maintenanceKcal: maintenance(),
      fatMassKg: fat(lean),
      fatFreeMassKg: weightKg - fat(lean),
      bodyFatPct: (100 * fat(lean)) / weightKg,
    });
    checkpoints.push({
      version: 1,
      model: "hall",
      seed,
      day,
      at,
      ecf,
      gly,
      lean,
      fatAnchor,
      leanAnchor,
    });
    if (day === days) break;
    stepDay = day;
    const nextAT = rk(dAT, day, at);
    const nextECF = rk(dECF, day, ecf);
    const nextGly = rk(dG, day, gly);
    const a = dLean(day, lean, gly, at, ecf);
    const b = dLean(
      day + 0.5,
      lean + 0.5 * a,
      (gly + nextGly) / 2,
      (at + nextAT) / 2,
      (ecf + nextECF) / 2,
    );
    const c = dLean(
      day + 0.5,
      lean + 0.5 * b,
      (gly + nextGly) / 2,
      (at + nextAT) / 2,
      (ecf + nextECF) / 2,
    );
    const d = dLean(day + 1, lean + c, nextGly, nextAT, nextECF);
    lean += (a + 2 * b + 2 * c + d) / 6;
    at = nextAT;
    ecf = nextECF;
    gly = nextGly;
    const nextWeightKg = lean + fat(lean) + ecf + 3.7 * gly;
    if (
      !Number.isFinite(nextWeightKg) ||
      lean <= 0 ||
      fat(lean) <= 0 ||
      gly <= 0 ||
      ecf <= 0
    )
      throw new Error("The model left its supported numerical range.");
  }
  return { points: result, checkpoints, events };
}
