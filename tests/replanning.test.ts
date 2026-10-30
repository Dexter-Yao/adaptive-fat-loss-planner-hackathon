// ABOUTME: Replanning preserves active facts until atomic promotion and rejects stale/cancelled candidate work.
import assert from "node:assert/strict";
import test from "node:test";
import { JourneyController } from "../src/application/journey-controller";
import { SessionCoreSchema, SessionSchema } from "../src/application/session";
import {
  SESSION_KEY,
  BACKUP_SESSION_KEY,
  loadSession,
} from "../src/application/persistence";
import { selectReplanning } from "../src/application/replanning";
import { activeAcceptance } from "../src/application/journey-commands";
import { selectGoalProgress } from "../src/application/goal-progress-view";
import { selectJourneyChartInput } from "../src/application/journey-chart-view";
import {
  fictionalInput,
  journeyHarness,
  FIXTURE_DATE,
} from "./support/journey-fixtures";
async function accepted() {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  return h;
}
const core = (s: unknown) => SessionCoreSchema.parse(s);
test("prefill keeps the actual measurement date; missing same-date body fat is not borrowed", async () => {
  const h = await accepted();
  h.setToday("2026-06-02");
  await h.controller.updateMeasurement({
    date: "2026-06-02",
    weightKg: 74.1,
    bodyFat: null,
    notes: "Fictional measurement",
  });
  const old = core(h.state);
  h.setToday("2026-06-04");
  await h.controller.beginReplanning();
  const draft = selectReplanning(h.state)!;
  assert.deepEqual(core(h.state), old);
  assert.equal(draft.input.profile.startDate, "2026-06-02");
  assert.equal(draft.input.profile.weightKg, 74.1);
  assert.equal(draft.input.profile.bodyFat, null);
  assert.notEqual(draft.input.goal.id, h.state.goal.id);
  assert.deepEqual(h.state.replanning!.candidate.logs, []);
  assert.equal(loadSession(h.storage).session?.replanning?.id, draft.id);
  await h.controller.cancelReplanning();
  assert.deepEqual(core(h.state), old);
  assert.equal(h.state.replanning, null);
});
test("failed generation and reload retain the active plan and resumable candidate", async () => {
  const h = await accepted(),
    old = core(h.state),
    stage = h.ports.stage;
  await h.controller.beginReplanning();
  h.ports.stage = async () => {
    throw new Error("offline");
  };
  await assert.rejects(() => h.controller.generateReplanning(), /offline/);
  assert.deepEqual(core(h.state), old);
  assert.equal(
    selectReplanning(loadSession(h.storage).session)?.status,
    "failed",
  );
  h.ports.stage = stage;
  const reopened = new JourneyController(h.access, h.ports);
  await reopened.generateReplanning();
  assert.deepEqual(core(h.state), old);
  assert.ok(h.state.replanning?.candidate.journey.candidateDraftId);
  assert.equal(h.state.archives.length, 0);
  await reopened.acceptReplanning();
  assert.notEqual(h.state.id, old.id);
  assert.ok(activeAcceptance(h.state));
  assert.equal(h.state.replanning, null);
  assert.deepEqual(h.state.archives[0].session, old);
  assert.deepEqual(loadSession(h.storage).session, h.state);
});
test("acceptance rechecks the server and a failed atomic promotion keeps active history", async () => {
  const h = await accepted(),
    old = core(h.state),
    calculate = h.ports.calculate;
  await h.controller.beginReplanning();
  await h.controller.generateReplanning();
  h.ports.calculate = async (r, signal) => {
    const result = await calculate(r, signal);
    h.storage.fail = true;
    return result;
  };
  await assert.rejects(() => h.controller.acceptReplanning(), /Storage quota/);
  assert.deepEqual(core(h.state), old);
  assert.equal(h.state.archives.length, 0);
  assert.equal(
    activeAcceptance(SessionSchema.parse(h.state.replanning!.candidate)),
    null,
  );
  h.storage.fail = false;
  h.ports.calculate = calculate;
  await h.controller.acceptReplanning();
  assert.deepEqual(h.state.archives[0].session, old);
  assert.ok(h.calculations.length >= 5);
});
test("cancelled late model replies cannot restore or promote a candidate", async () => {
  const h = await accepted(),
    old = core(h.state),
    stage = h.ports.stage;
  await h.controller.beginReplanning();
  let resolve!: () => void;
  const gate = new Promise<void>((r) => {
    resolve = r;
  });
  h.ports.stage = async (r, signal) => {
    await gate;
    return stage(r, signal);
  };
  const pending = h.controller.generateReplanning();
  const settled = assert.rejects(pending);
  await h.controller.cancelReplanning();
  resolve();
  await settled;
  assert.equal(h.state.replanning, null);
  assert.deepEqual(core(h.state), old);
});
test("changing the active facts invalidates a pending candidate instead of discarding newer facts", async () => {
  const h = await accepted();
  await h.controller.beginReplanning();
  await h.controller.generateReplanning();
  h.replace({ ...h.state, sourceRevision: h.state.sourceRevision + 1 });
  const before = structuredClone(h.state);
  await assert.rejects(
    () => h.controller.acceptReplanning(),
    /current plan changed/,
  );
  assert.deepEqual(h.state, before);
});
test("another tab's root write is preserved when a candidate attempts to publish", async () => {
  const h = await accepted();
  await h.controller.beginReplanning();
  const newer = { ...h.state, sourceRevision: h.state.sourceRevision + 1 };
  h.storage.setItem(SESSION_KEY, JSON.stringify(newer));
  await assert.rejects(
    () => h.controller.generateReplanning(),
    /Another tab changed/,
  );
  assert.equal(h.storage.getItem(SESSION_KEY), JSON.stringify(newer));
});
test("successive replans archive each core once without recursive history duplication", async () => {
  const h = await accepted(),
    first = core(h.state);
  await h.controller.beginReplanning();
  await h.controller.generateReplanning();
  await h.controller.acceptReplanning();
  const second = core(h.state);
  await h.controller.beginReplanning();
  await h.controller.generateReplanning();
  await h.controller.acceptReplanning();
  assert.deepEqual(
    h.state.archives.map((a) => a.session),
    [first, second],
  );
  assert.ok(
    h.state.archives.every(
      (a) => !("archives" in a.session) && !("replanning" in a.session),
    ),
  );
});
test("v5 sessions without replanning fields remain readable; invalid candidate identities are rejected", async () => {
  const h = await accepted(),
    before = core(h.state);
  const v5 = JSON.stringify({ ...before, version: 5 });
  h.storage.setItem(SESSION_KEY, v5);
  const migrated = loadSession(h.storage).session!;
  assert.deepEqual(core(migrated), before);
  assert.equal(migrated.version, 6);
  assert.equal(h.storage.getItem(BACKUP_SESSION_KEY), v5);
  h.replace(migrated);
  await h.controller.beginReplanning();
  const invalid = structuredClone(h.state);
  invalid.replanning!.candidate.id = invalid.id;
  assert.equal(SessionSchema.safeParse(invalid).success, false);
});

test("unknown future storage formats are preserved without migration or clearing", async () => {
  const h = await accepted();
  const raw = JSON.stringify({ ...h.state, version: 99 });
  h.storage.setItem(SESSION_KEY, raw);
  assert.throws(() => loadSession(h.storage));
  assert.equal(h.storage.getItem(SESSION_KEY), raw);
});
test("a confirmed new baseline date rebases only the candidate schedule", async () => {
  const h = await accepted(),
    old = core(h.state);
  h.setToday("2026-06-04");
  await h.controller.beginReplanning();
  const input = selectReplanning(h.state)!.input;
  input.profile.startDate = "2026-06-04";
  await h.controller.updateReplanningSetup(input);
  assert.equal(
    h.state.replanning!.candidate.preferences.mealSchedules[0].effectiveFrom,
    "2026-06-04",
  );
  assert.deepEqual(core(h.state), old);
  await h.controller.generateReplanning();
  await h.controller.acceptReplanning();
  assert.equal(h.state.profile.startDate, "2026-06-04");
  assert.deepEqual(h.state.archives[0].session, old);
});
test("an expired replacement deadline cannot be generated, retried or accepted after reopening", async () => {
  const h = await accepted(),
    old = core(h.state);
  await h.controller.beginReplanning();
  await h.controller.generateReplanning();
  h.setToday(h.state.replanning!.candidate.goal.requestedDate!);
  const reopened = new JourneyController(h.access, h.ports);
  await assert.rejects(() => reopened.generateReplanning(), /future goal date/);
  await assert.rejects(() => reopened.retryReplanning(), /future goal date/);
  await assert.rejects(() => reopened.acceptReplanning(), /future goal date/);
  assert.deepEqual(core(h.state), old);
  await reopened.cancelReplanning();
  assert.deepEqual(core(h.state), old);
});
test("goal cards and chart consume the promoted plan while old-goal facts remain historical", async () => {
  const h = await accepted(),
    old = core(h.state);
  await h.controller.beginReplanning();
  const input = selectReplanning(h.state)!.input;
  input.goal.value = 69;
  await h.controller.updateReplanningSetup(input);
  await h.controller.generateReplanning();
  assert.equal(
    selectGoalProgress(h.state, FIXTURE_DATE, "weight").summary.goal.value,
    68,
  );
  await h.controller.acceptReplanning();
  const progress = selectGoalProgress(h.state, FIXTURE_DATE, "body_fat");
  const chart = selectJourneyChartInput(
    h.state,
    FIXTURE_DATE,
    progress.summary,
  )!;
  assert.equal(progress.summary.goal.value, 69);
  assert.equal(chart.goal.id, h.state.goal.id);
  assert.equal(chart.binding.acceptedJourneyId, activeAcceptance(h.state)!.id);
  assert.deepEqual(chart.period, progress.summary.period);
  assert.deepEqual(chart.observations, h.state.logs);
  assert.deepEqual(chart.reference, activeAcceptance(h.state)!.reference);
  assert.deepEqual(h.state.archives[0].session, old);
});
