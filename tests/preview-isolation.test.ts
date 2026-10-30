// ABOUTME: Exercise the real persistence boundary through the example adapter without any personal data.
// ABOUTME: Preview writes, failures and reset must leave the personal and migration keys untouched.
import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKUP_SESSION_KEY,
  clearSession,
  loadSession,
  persistSession,
  RETIRED_SESSION_KEY,
  SESSION_KEY,
} from "../src/application/persistence";
import { ExampleRuntime } from "../src/application/preview-runtime";
import { createSession } from "../src/application/session";
import { fictionalInput } from "../src/fixtures/journey";
function withStorage(
  run: (values: Map<string, string>, runtime: ExampleRuntime) => void,
) {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const values = new Map<string, string>();
  const storage = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  try {
    run(values, new ExampleRuntime());
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}
function sample() {
  const input = fictionalInput();
  return createSession(input.profile, input.goal, input.preferences, [], true);
}
test("preview save, reload and reset cannot read or overwrite personal or migration data", () =>
  withStorage((values, runtime) => {
    for (const key of [SESSION_KEY, BACKUP_SESSION_KEY, RETIRED_SESSION_KEY])
      values.set(key, "personal sentinel");
    assert.equal(loadSession(runtime.storage()).session, null);
    const session = sample();
    persistSession(runtime.storage(), session, null);
    assert.equal(loadSession(runtime.storage()).session?.id, session.id);
    clearSession(runtime.storage());
    assert.equal(loadSession(runtime.storage()).session, null);
    for (const key of [SESSION_KEY, BACKUP_SESSION_KEY, RETIRED_SESSION_KEY])
      assert.equal(values.get(key), "personal sentinel");
  }));
test("a simulated storage failure leaves the last verified preview intact", () =>
  withStorage((_values, runtime) => {
    const saved = sample();
    persistSession(runtime.storage(), saved, null);
    runtime.fault = "storage_unavailable";
    assert.throws(
      () =>
        persistSession(
          runtime.storage(),
          { ...saved, sourceRevision: saved.sourceRevision + 1 },
          saved,
        ),
      /not saved/,
    );
    assert.deepEqual(loadSession(runtime.storage()).session, saved);
  }));
