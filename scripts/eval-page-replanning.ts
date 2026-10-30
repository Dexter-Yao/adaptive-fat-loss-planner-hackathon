// ABOUTME: Real local HTTP integration for D's state/persistence/controller using explicitly fictional inputs.
// ABOUTME: No browser state or credentials are captured; metadata receipts distinguish real calls from fixtures.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  journeyHarness,
  fictionalInput,
} from "../tests/support/journey-fixtures";
import {
  CalculationResponseSchema,
  StageResponseSchema,
  type JourneyPorts,
} from "../src/domain/workflow";
import { SessionCoreSchema } from "../src/application/session";
import { loadSession } from "../src/application/persistence";
import { selectReplanning } from "../src/application/replanning";
const base = new URL(
  process.argv.find((a) => a.startsWith("--base="))?.slice(7) ??
    "http://127.0.0.1:3240/",
);
if (
  base.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(base.hostname) ||
  !["3235", "3240"].includes(base.port)
)
  throw new Error("Use a dedicated 3235 or 3240 fictional test service.");
const events: { path: string; status: number; elapsedMs: number }[] = [];
async function post(path: string, body: unknown, signal: AbortSignal) {
  const started = Date.now(),
    response = await fetch(new URL(path, base), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  const raw = await response.json();
  events.push({
    path,
    status: response.status,
    elapsedMs: Date.now() - started,
  });
  if (!response.ok) throw new Error(raw.error ?? `HTTP ${response.status}`);
  return raw;
}
const ports: JourneyPorts = {
  calculate: async (r, s) =>
    CalculationResponseSchema.parse(await post("api/forecast", r, s)),
  stage: async (r, s) =>
    StageResponseSchema.parse(await post("api/journey", r, s)),
};
async function main() {
  const status = await (await fetch(new URL("api/status", base))).json();
  assert.equal(status.ready, true);
  assert.notEqual(status.provider, "fixture");
  const h = journeyHarness(ports);
  h.setToday("2026-10-29");
  const input = fictionalInput();
  input.profile.startDate = "2026-10-29";
  input.profile.activity = {
    work: "very_light",
    leisure: "very_light",
    routines: [],
    source: "questionnaire",
    migratedPal: null,
  };
  input.goal = { ...input.goal, value: 70, requestedDate: "2026-11-26" };
  input.preferences.mealSchedules = input.preferences.mealSchedules.map(
    (m) => ({ ...m, effectiveFrom: "2026-10-29" }),
  );
  input.preferences.availableTrainingMinutes = 0;
  input.preferences.context =
    "Fictional integration test. I work at a desk, buy lunch outside and have no kitchen. No scheduled exercise.";
  await h.controller.start(input, true);
  await h.controller.accept();
  await h.controller.updateMeasurement({
    date: "2026-10-29",
    weightKg: 73.4,
    bodyFat: null,
    notes:
      "Fictional check-in after travel, in the evening on a different scale.",
  });
  const old = SessionCoreSchema.parse(h.state);
  await h.controller.beginReplanning();
  assert.equal(
    selectReplanning(h.state)!.input.profile.startDate,
    "2026-10-29",
  );
  await h.controller.cancelReplanning();
  assert.deepEqual(SessionCoreSchema.parse(h.state), old);
  await h.controller.beginReplanning();
  const draft = selectReplanning(h.state)!.input;
  draft.goal.value = 71;
  draft.goal.requestedDate = "2026-12-10";
  await h.controller.updateReplanningSetup(draft);
  await h.controller.generateReplanning();
  assert.deepEqual(SessionCoreSchema.parse(h.state), old);
  assert.equal(h.state.archives.length, 0);
  await h.controller.acceptReplanning();
  assert.notEqual(h.state.id, old.id);
  assert.deepEqual(h.state.archives[0].session, old);
  assert.equal(h.state.replanning, null);
  assert.equal(h.state.logs.length, 0);
  assert.equal(h.state.profile.weightKg, 73.4);
  assert.deepEqual(loadSession(h.storage).session, h.state);
  const receipt = {
    date: "2026-10-29",
    fictional: true,
    provider: status.provider,
    model: status.model,
    result: "completed",
    requests: events.length,
    modelStageRequests: events.filter((e) => e.path === "api/journey").length,
    checks: [
      "initial generation and explicit acceptance",
      "measurement saved before forecast/review",
      "cancel preserves active core",
      "candidate generated without auto-acceptance",
      "rechecked atomic promotion",
      "full original core archived",
      "readback matches",
    ],
    events,
  };
  const dir = join(".runtime", `page-replanning-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "receipt.json"), JSON.stringify(receipt, null, 2));
  process.stdout.write(
    JSON.stringify({
      result: receipt.result,
      requests: receipt.requests,
      modelStageRequests: receipt.modelStageRequests,
      receipt: join(dir, "receipt.json"),
    }) + "\n",
  );
}
main().catch((e) => {
  process.stderr.write(
    JSON.stringify({ result: "failed", error: e.message, events }) + "\n",
  );
  process.exitCode = 1;
});
