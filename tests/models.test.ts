import { ForecastSnapshotSchema } from "../src/domain/forecast";
import { requestAt } from "./support/fixtures";
import { calculateForecast } from "../src/planning/evaluate";
// ABOUTME: Numerical reproduction against independent Python integrations and retained Hall C++ fixtures.
// ABOUTME: Agreement tests implementation, not prospective physiological prediction accuracy.
import assert from "node:assert/strict";
import test from "node:test";
import reference from "./fixtures/model-references.json";
import { simulateModel, MODEL_REGISTRY } from "../src/planning/models";
import { estimateBaseline } from "../src/planning/inputs";
import { addDays, type ProfileFacts } from "../src/domain/facts";
const close = (a: number, b: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} vs ${b}`);
for (const c of reference.cases)
  for (const model of ["thomas", "antonetti"] as const)
    test(`${model}: independent 0.001-day RK4 — ${c.id}`, () => {
      const profile: ProfileFacts = {
        ageYears: c.ageYears,
        sex: c.sex as "male" | "female",
        heightCm: c.heightCm,
        weightKg: c.weightKg,
        bodyFat: { percent: c.bodyFatPct, method: "dxa" },
        startDate: "2026-06-01",
        timezone: "UTC",
        eligibility: "standard",
        activity: {
          work: "very_light",
          leisure: "very_light",
          routines: [],
          source: "migrated",
          migratedPal: c.pal,
        },
      };
      const baseline = estimateBaseline(profile);
      close(baseline.tdeeKcal, c.tdeeKcal, 1e-8);
      const r = simulateModel(model, {
        profile,
        baseline,
        dates: Array.from({ length: 85 }, (_, i) =>
          addDays(profile.startDate, i),
        ),
        intakes: c.intakes,
        activityDeltas: c.activityDeltas,
      });
      for (const expected of c[model]) {
        const actual = r.points[expected.day];
        close(actual.weightKg, expected.weightKg);
        if (model === "thomas") {
          close(actual.bodyFatPct!, expected.bodyFatPct!);
          close(
            actual.fatMassKg! + actual.fatFreeMassKg!,
            actual.weightKg,
            1e-9,
          );
        } else assert.equal(actual.bodyFatPct, null);
      }
    });

test("the reference Thomas initialization retains non-flat nominal-maintenance behavior", () => {
  const c = reference.cases[0];
  assert.notEqual(c.thomas[0].weightKg, c.thomas.at(-1)!.weightKg);
  assert.ok(c.thomas.at(-1)!.weightKg < c.weightKg);
});

test("each model keeps continuous state across piecewise inputs and future forcing cannot leak into history", () => {
  const c = reference.cases[4],
    profile: ProfileFacts = {
      ageYears: 30,
      sex: "male",
      heightCm: 180,
      weightKg: 90,
      startDate: "2026-06-01",
      bodyFat: { percent: 28, method: "dxa" },
      timezone: "UTC",
      eligibility: "standard",
      activity: {
        work: "light",
        leisure: "active",
        routines: [],
        source: "migrated",
        migratedPal: 2.1,
      },
    },
    baseline = estimateBaseline(profile),
    dates = Array.from({ length: 85 }, (_, i) => addDays(profile.startDate, i));
  for (const id of ["hall", "thomas", "antonetti"] as const) {
    const input = {
        profile,
        baseline,
        dates,
        intakes: c.intakes,
        activityDeltas: c.activityDeltas,
      },
      first = simulateModel(id, input),
      second = simulateModel(id, {
        ...input,
        intakes: c.intakes.map((x, i) => (i >= 30 ? x + 300 : x)),
      });
    assert.deepEqual(first.points.slice(0, 31), second.points.slice(0, 31));
    assert.notEqual(first.points[31].weightKg, second.points[31].weightKg);
    for (const p of first.points)
      if (MODEL_REGISTRY[id].composition) {
        close(p.fatMassKg! + p.fatFreeMassKg!, p.weightKg, 1e-8);
        close((p.fatMassKg! / p.weightKg) * 100, p.bodyFatPct!, 1e-8);
      } else {
        assert.equal(p.fatMassKg, null);
        assert.equal(p.fatFreeMassKg, null);
      }
  }
});

test("output contracts reject duplicate models, invented body fat and inconsistent composition states", () => {
  const r = requestAt(),
    f = calculateForecast(r);
  assert.ok(ForecastSnapshotSchema.safeParse(f).success);
  const invented = structuredClone(f);
  invented.modelResults[2].current[0].bodyFatPct = 20;
  assert.equal(ForecastSnapshotSchema.safeParse(invented).success, false);
  const duplicate = structuredClone(f);
  duplicate.modelResults[2] = structuredClone(duplicate.modelResults[0]);
  assert.equal(ForecastSnapshotSchema.safeParse(duplicate).success, false);
  const mixed = structuredClone(f);
  mixed.modelResults[0].current[2].fatMassKg! += 1;
  assert.equal(ForecastSnapshotSchema.safeParse(mixed).success, false);
});
