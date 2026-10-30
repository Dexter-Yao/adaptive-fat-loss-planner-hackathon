// ABOUTME: Reproduce a rejected cold-reinitialization approach before adding measurement conditioning.
// ABOUTME: An exactly predicted observation should not itself change a continuous model's future.
import { mkdir, writeFile } from "node:fs/promises";
import { simulateModel } from "../src/planning/models";
import { estimateBaseline } from "../src/planning/inputs";
import { addDays, type ProfileFacts } from "../src/domain/facts";
async function main() {
  const profile: ProfileFacts = {
    ageYears: 36,
    sex: "male",
    heightCm: 175,
    weightKg: 82,
    startDate: "2026-10-01",
    bodyFat: { percent: 27, method: "dxa" },
    activity: {
      work: "very_light",
      leisure: "light",
      routines: [],
      source: "migrated",
      migratedPal: 1.6,
    },
    timezone: "Asia/Bangkok",
    eligibility: "standard",
  };
  const baseline = estimateBaseline(profile),
    dates = Array.from({ length: 91 }, (_, i) => addDays(profile.startDate, i));
  const input = {
    profile,
    baseline,
    dates,
    intakes: Array<number>(90).fill(1850),
    activityDeltas: Array<number>(90).fill(0),
  };
  const ids = ["hall", "thomas", "antonetti"] as const;
  const original = Object.fromEntries(
    ids.map((id) => [id, simulateModel(id, input).points]),
  ) as Record<(typeof ids)[number], ReturnType<typeof simulateModel>["points"]>;
  const results = [];
  for (const at of [7, 28, 56])
    for (const id of ids) {
      const p = original[id][at],
        bf = p.bodyFatPct ?? original.hall[at].bodyFatPct!;
      const nextProfile: ProfileFacts = {
        ...profile,
        startDate: dates[at],
        weightKg: p.weightKg,
        bodyFat: { percent: bf, method: "dxa" },
      };
      const nextBaseline = {
        ...estimateBaseline(nextProfile),
        tdeeKcal: original.hall[at].expenditureKcal!,
      };
      const restarted = simulateModel(id, {
        profile: nextProfile,
        baseline: nextBaseline,
        dates: dates.slice(at),
        intakes: input.intakes.slice(at),
        activityDeltas: input.activityDeltas.slice(at),
      }).points;
      results.push({
        id,
        restartedDay: at,
        observationResidualKg: 0,
        finalWeightDifferenceKg:
          restarted.at(-1)!.weightKg - original[id].at(-1)!.weightKg,
        nextWeekDifferenceKg:
          restarted[7].weightKg - original[id][at + 7].weightKg,
      });
    }
  const receipt = {
    checkedAt: new Date().toISOString(),
    question:
      "Does cold initialization at an exactly predicted measurement preserve the future?",
    candidate:
      "Reuse Hall estimated expenditure and per-model predicted composition, but discard internal state.",
    decision:
      "Rejected: preserve internal state; observation conditioning needs its own version and validation.",
    results,
  };
  const dir = ".runtime/journey-foundation-2026-10-28";
  await mkdir(dir, { recursive: true });
  await writeFile(
    dir + "/restart-experiment.json",
    JSON.stringify(receipt, null, 2),
  );
  console.log(JSON.stringify(receipt, null, 2));
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
