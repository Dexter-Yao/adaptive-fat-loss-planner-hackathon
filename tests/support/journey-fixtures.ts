// ABOUTME: Explicit fictional transport doubles and verified storage harness for core and UI handoff tests.
// ABOUTME: They never serve as a production fallback or claim that a model generated the content.
import { JourneyController } from "../../src/application/journey-controller";
import {
  persistSession,
  type SessionStorage,
} from "../../src/application/persistence";
import type { Session } from "../../src/application/session";
import { calculateJourney } from "../../src/planning/journey-calculation";
import { estimateBaseline } from "../../src/planning/inputs";
import { addDays, startOfWeek } from "../../src/domain/facts";
import { makeExample } from "../../src/domain/example";
import type {
  StageRequest,
  StageResponse,
  JourneyPorts,
} from "../../src/domain/workflow";
export {
  FIXTURE_DATE,
  fictionalInput,
  fictionalStage,
} from "../../src/fixtures/journey";
import { FIXTURE_DATE, fictionalStage } from "../../src/fixtures/journey";
export class MemorySessionStorage implements SessionStorage {
  values = new Map<string, string>();
  fail = false;
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.fail) throw new Error("Storage quota exceeded");
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
export function journeyHarness(overrides: Partial<JourneyPorts> = {}) {
  let state: Session | null = null,
    today = FIXTURE_DATE;
  const storage = new MemorySessionStorage(),
    calls: StageRequest[] = [],
    calculations: unknown[] = [];
  const ports: JourneyPorts = {
    calculate: async (r) => {
      calculations.push(r);
      return calculateJourney(r);
    },
    stage: async (r) => {
      calls.push(structuredClone(r));
      return fictionalStage(r);
    },
    ...overrides,
  };
  const access = {
    read: () => state,
    publish: (next: Session) => {
      persistSession(storage, next, state);
      state = next;
    },
    today: () => today,
  };
  const controller = new JourneyController(access, ports);
  return {
    controller,
    storage,
    ports,
    access,
    calls,
    calculations,
    get state() {
      return state!;
    },
    setToday: (d: string) => {
      today = d;
    },
    replace: (s: Session) => access.publish(s),
  };
}
