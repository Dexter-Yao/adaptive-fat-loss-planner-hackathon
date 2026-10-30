import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  hallForecast,
  restingEnergy,
  type HallInput,
} from "../src/planning/hall";

const reference = JSON.parse(
  readFileSync(
    new URL("./fixtures/hall-reference.json", import.meta.url),
    "utf8",
  ),
) as {
  commit: string;
  cases: { name: string; input: HallInput; weights: number[] }[];
};
for (const sample of reference.cases) {
  test(`Hall port matches independent upstream C++: ${sample.name}`, () => {
    const points = hallForecast(sample.input);
    assert.equal(points.length, sample.weights.length);
    for (let i = 0; i < points.length; i++)
      assert.ok(
        Math.abs(points[i].weightKg - sample.weights[i]) < 1e-8,
        `day ${i}: ${points[i].weightKg} vs ${sample.weights[i]}`,
      );
  });
}
test("energy balance remains steady and the full horizon is returned", () => {
  const input: HallInput = {
    ageYears: 35,
    sex: "male",
    heightCm: 180,
    weightKg: 80,
    pal: 1.5,
    days: 90,
    intakeKcal: 0,
  };
  input.intakeKcal = restingEnergy(input) * input.pal;
  const result = hallForecast(input);
  assert.equal(result.length, 91);
  assert.ok(result.every((point) => Math.abs(point.weightKg - 80) < 1e-9));
});
test("invalid numerical inputs fail rather than emitting a misleading curve", () => {
  const valid: HallInput = {
    ageYears: 35,
    sex: "male",
    heightCm: 180,
    weightKg: 80,
    pal: 1.5,
    days: 30,
    intakeKcal: 2000,
  };
  assert.throws(() => hallForecast({ ...valid, intakeKcal: NaN }));
  assert.throws(() => hallForecast({ ...valid, ageYears: 12 }));
  assert.throws(() => hallForecast({ ...valid, days: 0 }));
  assert.throws(() => hallForecast({ ...valid, days: 366 }));
});
test("whole-day intake forcing cannot let tomorrow's total change today's state", () => {
  const input: HallInput = {
    ageYears: 35,
    sex: "male",
    heightCm: 180,
    weightKg: 80,
    pal: 1.5,
    days: 8,
    intakeKcal: Array(9).fill(2000),
    intakeTiming: "whole-day",
  };
  const original = hallForecast(input);
  const changed = hallForecast({
    ...input,
    intakeKcal: Array.from({ length: 9 }, (_, day) => (day < 4 ? 2000 : 3500)),
  });
  assert.deepEqual(original.slice(0, 5), changed.slice(0, 5));
  assert.notEqual(original[5].weightKg, changed[5].weightKg);
  const prefix = hallForecast({
    ...input,
    days: 4,
    intakeKcal: Array(5).fill(2000),
  });
  assert.deepEqual(prefix, original.slice(0, 5));
});
test("constant whole-day forcing preserves the original kernel and finite maintenance estimates", () => {
  const input: HallInput = {
    ageYears: 35,
    sex: "male",
    heightCm: 180,
    weightKg: 80,
    pal: 1.5,
    days: 30,
    intakeKcal: 2000,
  };
  const sampled = hallForecast(input),
    wholeDay = hallForecast({ ...input, intakeTiming: "whole-day" });
  assert.deepEqual(wholeDay, sampled);
  assert.ok(
    wholeDay.every(
      (point) =>
        Number.isFinite(point.maintenanceKcal) && point.maintenanceKcal > 0,
    ),
  );
  assert.equal(hallForecast({ ...input, days: 365 }).length, 366);
});
