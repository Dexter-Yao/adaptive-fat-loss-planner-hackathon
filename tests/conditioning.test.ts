// ABOUTME: Numerical continuation and observation-policy invariants, independent of any UI or provider.
// ABOUTME: These tests establish state consistency, not prospective human prediction accuracy.
import assert from "node:assert/strict";
import test from "node:test";
import { simulateModel, type SimulationInput } from "../src/planning/models";
import { estimateBaseline } from "../src/planning/inputs";
import { addDays } from "../src/domain/facts";
import { requestAt } from "./support/fixtures";
const r = requestAt();
const input: SimulationInput = {
  profile: r.profile,
  baseline: estimateBaseline(r.profile),
  dates: Array.from({ length: 85 }, (_, i) => addDays(r.profile.startDate, i)),
  intakes: Array(84).fill(1850),
  activityDeltas: Array(84).fill(0),
};
const close = (a: number, b: number, t = 1e-9) =>
  assert.ok(Math.abs(a - b) < t, `${a} vs ${b}`);
for (const id of ["hall", "thomas", "antonetti"] as const) {
  test(`${id}: uninterrupted and serialized-checkpoint continuation agree`, () => {
    const full = simulateModel(id, input),
      checkpoint = JSON.parse(JSON.stringify(full.checkpoints[28])),
      resumed = simulateModel(id, { ...input, resume: checkpoint });
    assert.deepEqual(resumed.points, full.points.slice(28));
    assert.throws(
      () =>
        simulateModel(id, {
          ...input,
          profile: { ...input.profile, weightKg: 83 },
          resume: checkpoint,
        }),
      /checkpoint/,
    );
  });
  for (const day of [7, 28, 56])
    test(`${id}: zero innovation preserves state at day ${day}`, () => {
      const full = simulateModel(id, input),
        p = full.points[day];
      const conditioned = simulateModel(id, {
        ...input,
        measurements: [
          {
            day,
            weightKg: p.weightKg,
            bodyFatPct: p.bodyFatPct,
            method: "dxa",
          },
        ],
      });
      assert.deepEqual(conditioned.points, full.points);
      assert.equal(conditioned.events[0].status, "unchanged");
    });
  test(`${id}: small perturbations are continuous and changed observations affect no earlier date`, () => {
    const full = simulateModel(id, input),
      w = full.points[28].weightKg;
    for (const delta of [-1e-5, 1e-5]) {
      const c = simulateModel(id, {
        ...input,
        measurements: [
          { day: 28, weightKg: w + delta, bodyFatPct: null, method: null },
        ],
      });
      assert.deepEqual(c.points.slice(0, 28), full.points.slice(0, 28));
      close(c.points[28].weightKg, w + delta);
      assert.ok(
        Math.abs(c.points[84].weightKg - full.points[84].weightKg) < 0.0001,
      );
    }
  });
  test(`${id}: historical correction replays deterministically and future data never leak backward`, () => {
    const m = [
      {
        day: 14,
        weightKg: input.profile.weightKg - 0.5,
        bodyFatPct: null,
        method: null,
      },
      {
        day: 42,
        weightKg: input.profile.weightKg - 1,
        bodyFatPct: null,
        method: null,
      },
    ];
    const a = simulateModel(id, { ...input, measurements: m }),
      b = simulateModel(id, {
        ...input,
        measurements: [{ ...m[0], weightKg: m[0].weightKg + 0.1 }, m[1]],
      });
    assert.deepEqual(a.points.slice(0, 14), b.points.slice(0, 14));
    assert.deepEqual(
      a.points.slice(0, 42),
      simulateModel(id, { ...input, measurements: [m[0]] }).points.slice(0, 42),
    );
    assert.deepEqual(
      b,
      simulateModel(id, {
        ...input,
        measurements: [{ ...m[0], weightKg: m[0].weightKg + 0.1 }, m[1]],
      }),
    );
    const resumed = simulateModel(id, {
      ...input,
      measurements: m,
      resume: a.checkpoints[28],
    });
    assert.deepEqual(resumed.points, a.points.slice(28));
  });
}
test("joint composition and BF-only measurements retain source semantics and capability limits", () => {
  for (const id of ["hall", "thomas"] as const) {
    const full = simulateModel(id, input),
      p = full.points[28],
      both = simulateModel(id, {
        ...input,
        measurements: [
          {
            day: 28,
            weightKg: p.weightKg - 0.3,
            bodyFatPct: 25,
            method: "bia",
          },
        ],
      }),
      fatOnly = simulateModel(id, {
        ...input,
        measurements: [
          { day: 28, weightKg: null, bodyFatPct: 25, method: "bia" },
        ],
      });
    close(both.points[28].bodyFatPct!, 25);
    close(both.points[28].weightKg, p.weightKg - 0.3);
    close(fatOnly.points[28].weightKg, p.weightKg);
    close(fatOnly.points[28].bodyFatPct!, 25);
    assert.equal(fatOnly.events[0].estimatedWeightUsed, true);
    assert.equal(fatOnly.events[0].observedWeightKg, null);
    for (const v of both.points)
      close(v.weightKg, v.fatMassKg! + v.fatFreeMassKg!);
  }
  const a = simulateModel("antonetti", input),
    b = simulateModel("antonetti", {
      ...input,
      measurements: [
        { day: 28, weightKg: null, bodyFatPct: 25, method: "bia" },
      ],
    });
  assert.deepEqual(a.points, b.points);
  assert.equal(b.events[0].status, "not_supported");
});
test("an incompatible Hall observation is retained as a limitation rather than clamped", () => {
  const a = simulateModel("hall", input),
    b = simulateModel("hall", {
      ...input,
      measurements: [{ day: 28, weightKg: 1, bodyFatPct: null, method: null }],
    });
  assert.deepEqual(a.points, b.points);
  assert.equal(b.events[0].status, "unsupported");
});
