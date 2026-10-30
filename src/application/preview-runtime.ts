// ABOUTME: Explicit example-only adapters for A's existing provider/controller, not an inference fallback.
// ABOUTME: Namespaced persistence cannot read or overwrite a personal session; faults affect only the preview.
import type { JourneyPorts } from "../domain/workflow";
import { StageResponseSchema } from "../domain/workflow";
import { FIXTURE_DATE } from "../fixtures/journey";
import { journeyHttpPorts } from "./journey-client";
import type { SessionStorage } from "./persistence";
export type PreviewFault =
  | "none"
  | "model_unavailable"
  | "slow_model"
  | "storage_unavailable"
  | "suggest_revision";
export interface ApplicationRuntime {
  storage(): SessionStorage;
  storageKey(key: string): string;
  today?(): string;
  ports?: JourneyPorts;
  example?: boolean;
}
export class ExampleRuntime implements ApplicationRuntime {
  readonly example = true;
  private fallbackDate = FIXTURE_DATE;
  get date() {
    return typeof window === "undefined"
      ? this.fallbackDate
      : (localStorage.getItem("adaptive.example.clock") ?? this.fallbackDate);
  }
  set date(value: string) {
    this.fallbackDate = value;
    if (typeof window !== "undefined")
      localStorage.setItem("adaptive.example.clock", value);
  }
  fault: PreviewFault = "none";
  storageKey(key: string) {
    return `adaptive.example.${key}`;
  }
  today() {
    return this.date;
  }
  storage(): SessionStorage {
    return {
      getItem: (key) => localStorage.getItem(this.storageKey(key)),
      setItem: (key, value) => {
        if (this.fault === "storage_unavailable")
          throw new Error(
            "Simulated browser storage failure. This preview update was not saved.",
          );
        localStorage.setItem(this.storageKey(key), value);
      },
      removeItem: (key) => localStorage.removeItem(this.storageKey(key)),
    };
  }
  readonly ports: JourneyPorts = {
    calculate: (request, signal) => journeyHttpPorts.calculate(request, signal),
    stage: async (request, signal) => {
      const response = await fetch(`/api/example/stage?mode=${this.fault}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error ?? "The fictional preview could not complete this step.",
        );
      return StageResponseSchema.parse(body);
    },
  };
}
