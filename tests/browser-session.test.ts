// ABOUTME: Original migration cases plus storage readback and cleanup failure paths.
import assert from "node:assert/strict";
import test from "node:test";
import {
  migrateSession,
  loadSession,
  persistSession,
  SESSION_KEY,
  RETIRED_SESSION_KEY,
  type SessionStorage,
} from "../src/application/persistence";
import { createSession, saveDailyRecord } from "../src/application/session";
import { retiredExample } from "./support/fixtures";
import { exampleRequest } from "../src/domain/example";
class MemoryStorage implements SessionStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
test("version-one migration preserves raw profile and corrected history but never displays obsolete numbers", () => {
  const request = exampleRequest("2026-10-28"),
    restored = migrateSession(
      JSON.stringify({
        version: 1,
        profile: retiredExample().profile,
        logs: retiredExample().logs,
        isExample: true,
        result: { forecast: { dailyCalories: 300 } },
        previousForecast: null,
      }),
    );
  assert.equal(restored.profile.weightKg, request.profile.weightKg);
  assert.equal(restored.profile.activity.source, "migrated");
  assert.equal(restored.profile.activity.migratedPal, 1.6);
  assert.deepEqual(restored.logs[0].intake, {
    mode: "daily_total",
    kcal: 2100,
  });
  assert.equal(restored.historicalAnalysis !== null, true);
  assert.equal(restored.snapshot, null);
  assert.deepEqual(restored.weeklyPlans, []);
  assert.equal(restored.isExample, true);
});
test("unrecognized saved data has an explicit error instead of an empty successful restoration", () => {
  assert.throws(() => migrateSession('{"version":99}'), /version|Invalid/);
});
test("migration preserves accepted revisions and removes retired storage only after verified writeback", () => {
  const storage = new MemoryStorage(),
    r = exampleRequest("2026-10-28"),
    targets = [
      {
        effectiveFrom: r.profile.startDate,
        dailyCalories: 1825,
        targetDate: r.goal.requestedDate!,
        mode: "loss",
      },
    ];
  storage.setItem(
    RETIRED_SESSION_KEY,
    JSON.stringify({
      version: 2,
      profile: retiredExample().profile,
      logs: retiredExample().logs,
      isExample: true,
      result: { acceptedPlans: targets },
    }),
  );
  const loaded = loadSession(storage);
  assert.deepEqual(
    loaded.session?.targetRevisions,
    targets.map((t) => ({ ...t, goalId: "migrated-goal" })),
  );
  assert.deepEqual(loaded.session?.weeklyPlans, []);
  assert.equal(storage.getItem(RETIRED_SESSION_KEY), null);
  assert.ok(storage.getItem(SESSION_KEY));
  assert.match(loaded.notice!, /preserved/);
});
test("quota/readback failure never clears the original migration source or reports successful saving", () => {
  const storage = new MemoryStorage(),
    r = exampleRequest("2026-10-28"),
    text = JSON.stringify({
      version: 1,
      profile: retiredExample().profile,
      logs: retiredExample().logs,
      isExample: true,
    });
  storage.setItem(RETIRED_SESSION_KEY, text);
  storage.setItem = () => {
    throw new Error("Quota exceeded");
  };
  assert.throws(() => loadSession(storage), /Quota/);
  assert.equal(storage.getItem(RETIRED_SESSION_KEY), text);
  const session = createSession(r.profile, r.goal, r.preferences);
  assert.throws(
    () =>
      persistSession(
        { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        session,
      ),
    /verify/,
  );
});
test("invalid current storage is not replaced by a retired copy", () => {
  const storage = new MemoryStorage();
  storage.setItem(SESSION_KEY, '{"version":99}');
  storage.setItem(RETIRED_SESSION_KEY, "{}");
  assert.throws(() => loadSession(storage));
  assert.equal(storage.getItem(SESSION_KEY), '{"version":99}');
  assert.equal(storage.getItem(RETIRED_SESSION_KEY), "{}");
});
test("a stale writer cannot replace a newer stored diary, and starting a session preserves unknown data", () => {
  const storage = new MemoryStorage(),
    r = exampleRequest("2026-10-28"),
    initial = createSession(r.profile, r.goal, r.preferences),
    newer = saveDailyRecord(
      initial,
      {
        date: "2026-10-28",
        weightKg: 71.9,
        intake: null,
        bodyFat: null,
        steps: null,
        activity: null,
        notes: "",
      },
      "2026-10-28",
    );
  persistSession(storage, initial, null);
  persistSession(storage, newer, initial);
  assert.throws(() => persistSession(storage, initial, initial), /Another tab/);
  assert.deepEqual(loadSession(storage).session?.logs, newer.logs);
  storage.setItem(SESSION_KEY, '{"version":99}');
  assert.throws(() => persistSession(storage, initial, null), /preserved/);
  assert.equal(storage.getItem(SESSION_KEY), '{"version":99}');
});
