"use client";
// ABOUTME: One root-lifetime controller for persistence, the local calendar clock and bounded Agent requests.
// ABOUTME: Screens issue commands; storage mechanics stay in the adapter and model requests in the HTTP client.
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";
import { type PlanningPreferences, type GoalSpec } from "../domain/contracts";
import { JourneyController } from "./journey-controller";
import {
  clearSession,
  loadSession,
  persistSession,
  SESSION_KEY,
} from "./persistence";
import { replanningSession, selectReplanning } from "./replanning";
import type {
  ReplanningCommands,
  ReplanningDraftView,
} from "./replanning-contract";
import type { ApplicationRuntime } from "./preview-runtime";
import { localToday } from "./selectors";
import { savePreferences as preferencesCommand, type Session } from "./session";
import {
  ForecastDisplaySchema,
  type ForecastSelection,
  pinForecastSelection,
  sameForecastBusinessState,
} from "./forecast-display";
const ConnectionSchema = z.object({
  ready: z.boolean(),
  label: z.string(),
  message: z.string().nullable(),
  provider: z.string(),
  model: z.string(),
});
type Connection = z.infer<typeof ConnectionSchema>;
export type JourneyCommands = Pick<
  JourneyController,
  | "running"
  | "start"
  | "adoptExisting"
  | "updateSetup"
  | "generate"
  | "feedback"
  | "proposeRevision"
  | "dismissProposal"
  | "accept"
  | "updateMeasurement"
  | "recalculate"
  | "reviewProgress"
  | "dismissReview"
  | "retry"
  | "cancel"
>;
export interface Application {
  journey: JourneyCommands;
  scope: "active" | "replanning";
  replanning: ReplanningDraftView | null;
  replanningCommands: ReplanningCommands;
  candidateSession: Session | null;
  candidateJourney: JourneyCommands;
  session: Session | null;
  hydrated: boolean;
  today: string;
  connection: Connection | null;
  error: string;
  notice: string;
  savePreferences: (value: PlanningPreferences) => boolean;
  pinForecastSelection: (
    metric: GoalSpec["kind"],
    selection: ForecastSelection,
  ) => boolean;
  setDailyVariation: (show: boolean) => boolean;
  reset: () => boolean;
  clearError: () => void;
}
const ApplicationContext = createContext<Application | null>(null);
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The operation could not be completed. Your existing data is preserved.";
export function ApplicationProvider({
  children,
  runtime,
  clockVersion = 0,
}: {
  children: ReactNode;
  runtime?: ApplicationRuntime;
  clockVersion?: number;
}) {
  const storage = () => runtime?.storage() ?? localStorage;
  const [session, setSession] = useState<Session | null>(null),
    current = useRef<Session | null>(null);
  const [hydrated, setHydrated] = useState(false),
    [today, setToday] = useState("");
  const dateRef = useRef("");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  function publish(
    next: Session,
    before: Session | null = current.current,
  ): void {
    persistSession(storage(), next, before);
    current.current = next;
    setSession(next);
    if (
      before &&
      before.id !== next.id &&
      next.archives.some((a) => a.session.id === before.id)
    )
      setNotice(
        "New plan accepted. Previous plans and records are saved in history.",
      );
    else if (
      before &&
      JSON.stringify(before.logs) !== JSON.stringify(next.logs)
    )
      setNotice("Check-in saved.");
  }
  const journey = useRef<JourneyController | null>(null);
  if (!journey.current)
    journey.current = new JourneyController(
      {
        read: () => current.current,
        publish: (next) => publish(next),
        today: () => dateRef.current,
      },
      runtime?.ports,
    );
  useEffect(() => {
    const clock = () => {
      const date =
        runtime?.today?.() ?? localToday(current.current?.profile.timezone);
      dateRef.current = date;
      setToday(date);
    };
    clock();
    try {
      const loaded = loadSession(storage());
      current.current = loaded.session;
      setSession(loaded.session);
      setNotice(loaded.notice ?? "");
      clock();
    } catch (failure) {
      setError(errorMessage(failure));
    }
    setHydrated(true);
    if (runtime?.example)
      setConnection({
        ready: true,
        label: "Fictional preview",
        message: "Scripted coaching only.",
        provider: "fixture",
        model: "fictional-test-double",
      });
    else
      void fetch("/api/status")
        .then((response) => response.json())
        .then((raw) => setConnection(ConnectionSchema.parse(raw)))
        .catch(() =>
          setConnection({
            ready: false,
            label: "Connection unavailable",
            message:
              "The model connection is unavailable. You can still save measurements.",
            provider: "",
            model: "",
          }),
        );
    const timer = setInterval(clock, 30_000);
    const sync = (event: StorageEvent) => {
      if (event.key !== (runtime?.storageKey(SESSION_KEY) ?? SESSION_KEY))
        return;
      try {
        const loaded = loadSession(storage());
        const displayOnly = sameForecastBusinessState(
          current.current,
          loaded.session,
        );
        if (!displayOnly) journey.current?.dispose();
        current.current = loaded.session;
        setSession(loaded.session);
        setNotice(
          displayOnly
            ? "Chart preferences updated from another tab."
            : "Updated from another tab.",
        );
      } catch (failure) {
        setError(errorMessage(failure));
      }
    };
    window.addEventListener("focus", clock);
    window.addEventListener("storage", sync);
    return () => {
      journey.current?.dispose();
      clearInterval(timer);
      window.removeEventListener("focus", clock);
      window.removeEventListener("storage", sync);
    };
  }, []);
  useEffect(() => {
    if (!runtime?.today) return;
    const date = runtime.today();
    dateRef.current = date;
    setToday(date);
  }, [runtime, clockVersion]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  function command(change: (s: Session) => Session, message: string) {
    if (!current.current) return null;
    try {
      const next = change(current.current);
      publish(next);
      setNotice(message);
      return next;
    } catch (failure) {
      setError(errorMessage(failure));
      return null;
    }
  }
  const root = journey.current,
    child = root.replanningController;
  const replanningCommands: ReplanningCommands = {
    beginReplanning: () => root.beginReplanning(),
    updateReplanningSetup: (input) => root.updateReplanningSetup(input),
    generateReplanning: () => root.generateReplanning(),
    acceptReplanning: () => root.acceptReplanning(),
    cancelReplanning: () => root.cancelReplanning(),
  };
  const candidateJourney: JourneyCommands = {
    get running() {
      return child.running;
    },
    start: async () => {
      throw new Error("Begin replanning from the active plan first.");
    },
    adoptExisting: () => child.adoptExisting(),
    updateSetup: (input) => root.updateReplanningSetup(input),
    generate: () => root.generateReplanning(),
    feedback: (value) => child.feedback(value),
    proposeRevision: (revision, intent) =>
      child.proposeRevision(revision, intent),
    dismissProposal: () => child.dismissProposal(),
    accept: () => root.acceptReplanning(),
    updateMeasurement: async () => {
      throw new Error(
        "Add measurements to the current plan before starting a new-plan draft.",
      );
    },
    recalculate: (manual) => child.recalculate(manual),
    reviewProgress: (manual) => child.reviewProgress(manual),
    dismissReview: () => child.dismissReview(),
    retry: () => root.retryReplanning(),
    cancel: () => child.cancel(),
  };
  const value: Application = {
    journey: root,
    scope: "active",
    replanning: selectReplanning(session, child.running),
    replanningCommands,
    candidateSession: replanningSession(session),
    candidateJourney,
    session,
    hydrated,
    today,
    connection,
    error,
    notice,
    pinForecastSelection(metric, selection) {
      setError("");
      setNotice("");
      return Boolean(
        command(
          (s) => ({
            ...s,
            forecastDisplay: pinForecastSelection(
              s.forecastDisplay,
              metric,
              selection,
            ),
          }),
          "Chart preference saved.",
        ),
      );
    },
    setDailyVariation(show) {
      setError("");
      setNotice("");
      return Boolean(
        command(
          (s) => ({
            ...s,
            forecastDisplay: ForecastDisplaySchema.parse({
              ...s.forecastDisplay,
              dailyVariation: show,
            }),
          }),
          "Chart preference saved.",
        ),
      );
    },
    savePreferences(value) {
      const next = command(
        (s) => preferencesCommand(s, value, dateRef.current),
        "Preferences saved. Updating the forecast…",
      );
      if (next) {
        if (next.journey.enabled)
          void journey
            .current!.recalculate()
            .catch((failure) => setError(errorMessage(failure)));
      }
      return Boolean(next);
    },
    reset() {
      try {
        journey.current?.dispose();
        clearSession(storage());
        current.current = null;
        setSession(null);
        setError("");
        setNotice("");
        return true;
      } catch (failure) {
        setError(errorMessage(failure));
        return false;
      }
    },
    clearError() {
      setError("");
    },
  };
  return (
    <ApplicationContext.Provider value={value}>
      {children}
    </ApplicationContext.Provider>
  );
}
export function useApplication(): Application {
  const value = useContext(ApplicationContext);
  if (!value)
    throw new Error("ApplicationProvider must own the shared session.");
  return value;
}

/** A derived context over the same root-owned candidate; it holds no separate store or persistence port. */
export function ReplanningScope({ children }: { children: ReactNode }) {
  const app = useApplication();
  if (!app.candidateSession) return null;
  return (
    <ApplicationContext.Provider
      value={{
        ...app,
        scope: "replanning",
        session: app.candidateSession,
        journey: app.candidateJourney,
      }}
    >
      {children}
    </ApplicationContext.Provider>
  );
}
