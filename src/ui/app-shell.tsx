"use client";
// ABOUTME: Shared two-page navigation, lightweight measurement entry and unsaved-edit guards.
// ABOUTME: Shell state is presentational. Facts and task lifecycle belong to A's application provider.
import { selectJourney } from "@/application/journey-selectors";
import { useApplication } from "@/application/provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { RotateCcw, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { MeasurementUpdate } from "@/domain/workflow";

import { Brand } from "./brand";
import { PreviewControls } from "./example-screen";
import { useAppPath } from "./journey-view";
import { MeasurementEditor } from "./measurement-editor";
import { workflowErrorText } from "./workflow-error";
import { navigatePlan } from "./plan-navigation";

type Overlay = { kind: "measurement"; date: string } | null;
interface Shell {
  setDraftDirty: (dirty: boolean) => void;
  record: (date?: string) => void;
  settings: () => void;
}
const ShellContext = createContext<Shell | null>(null);
export function useShell() {
  const value = useContext(ShellContext);
  if (!value) throw new Error("AppShell owns navigation and editors.");
  return value;
}
const links = [
  { href: "/plan", label: "Plan" },
  { href: "/records", label: "Records" },
];
export function AppShell({ children }: { children: ReactNode }) {
  const app = useApplication(),
    pathname = usePathname(),
    router = useRouter(),
    path = useAppPath();
  const [draftDirty, setDraftDirty] = useState(false),
    [pendingHref, setPendingHref] = useState<string | null>(null),
    [overlay, setOverlay] = useState<Overlay>(null),
    [entryError, setEntryError] = useState(""),
    [pendingMeasurement, setPendingMeasurement] = useState<{
      fields: MeasurementUpdate;
      before: typeof app.session;
    } | null>(null);
  const example = pathname.startsWith("/example"),
    localPath = example ? pathname.slice(8) || "/" : pathname,
    publicPage = ["/", "/start", "/replan", "/access"].includes(localPath),
    s = app.session,
    view = s ? selectJourney(s, app.today, app.journey.running) : null;
  useEffect(() => {
    if (app.hydrated && !s && !publicPage) router.replace(path("/"));
  }, [app.hydrated, Boolean(s), publicPage, pathname]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (draftDirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draftDirty]);
  useEffect(() => {
    if (!pendingMeasurement || !s || s === pendingMeasurement.before) return;
    const measurement = pendingMeasurement.fields;
    const saved = s.logs.find((l) => l.date === measurement.date);
    if (
      saved &&
      saved.weightKg === measurement.weightKg &&
      JSON.stringify(saved.bodyFat) === JSON.stringify(measurement.bodyFat) &&
      saved.notes === measurement.notes
    ) {
      setOverlay(null);
      setPendingMeasurement(null);
    }
  }, [s, pendingMeasurement]);
  const shell: Shell = {
    setDraftDirty,
    record(date = app.today) {
      setEntryError("");
      app.clearError();
      setOverlay({ kind: "measurement", date });
    },
    settings() {
      router.push(path("/settings"));
    },
  };
  if (!app.hydrated || !app.today || (!s && !publicPage))
    return (
      <div className="boot-screen" role="status">
        <Brand />
        <Spinner />
        <p>Opening your saved plan…</p>
      </div>
    );
  return (
    <ShellContext.Provider value={shell}>
      <div
        className="app-frame"
        onClickCapture={(e) => {
          if (!draftDirty || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey)
            return;
          const a = (e.target as HTMLElement).closest("a");
          if (!a || a.target === "_blank") return;
          const url = new URL(a.href, window.location.href);
          if (
            url.origin !== window.location.origin ||
            (url.pathname === pathname && !a.hasAttribute("data-plan-view"))
          )
            return;
          e.preventDefault();
          e.stopPropagation();
          setPendingHref(url.pathname + url.search + url.hash);
        }}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-card focus:p-4"
        >
          Skip to content
        </a>
        <header className="app-header">
          <Link href={path("/")} aria-label="Adaptive Fat Loss Planner home">
            <Brand />
          </Link>
          {!publicPage && (
            <nav className="desktop-nav" aria-label="Main navigation">
              {links.map((l) => (
                <Button key={l.href} variant="ghost" asChild>
                  <Link
                    href={path(l.href)}
                    aria-current={localPath === l.href ? "page" : undefined}
                  >
                    {l.label}
                  </Link>
                </Button>
              ))}
            </nav>
          )}
          {s && !publicPage && (
            <div className="header-actions">
              <Button variant="ghost" asChild>
                <Link href={path("/settings")}>
                  <Settings2 aria-hidden /> Settings
                </Link>
              </Button>
              {view?.hasAcceptedJourney && (
                <Button variant="outline" asChild>
                  <Link href={path("/replan")}>
                    <RotateCcw aria-hidden />{" "}
                    {app.replanning ? "Resume new plan" : "Replan"}
                  </Link>
                </Button>
              )}
            </div>
          )}
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className={`app-content${localPath === "/start" ? " onboarding-content" : ""}`}
        >
          {example && (
            <div className="example-banner" role="note">
              <strong>Fictional preview.</strong> Scripted coaching; separate
              from your plan. <Link href="/">Leave example</Link>
            </div>
          )}
          {/* Editor failures stay in the editor; persisted workflow tasks own asynchronous recovery. */}
          {app.error && !overlay && (
            <Alert variant="destructive" className="global-message">
              <AlertTitle>That change could not be completed</AlertTitle>
              <AlertDescription>
                {workflowErrorText(app.error)}
                <Button
                  variant="ghost"
                  onClick={() => {
                    app.clearError();
                    setEntryError("");
                  }}
                >
                  Dismiss
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {view?.progress.guidanceWithheld &&
            view.hasAcceptedJourney &&
            s?.snapshot?.decision.status === "paused" && (
              <Alert variant="destructive" className="global-message">
                <AlertTitle>{s.snapshot.decision.title}</AlertTitle>
                <AlertDescription>
                  {s.snapshot.decision.summary} You can still add or correct
                  measurements.
                </AlertDescription>
              </Alert>
            )}
          {app.notice && (
            <p role="status" className="field-hint">
              {app.notice}
            </p>
          )}
          {children}
          {example && <PreviewControls />}
        </main>
        {app.journey.running &&
          view?.hasAcceptedJourney &&
          !["/plan", "/records"].includes(localPath) && (
            <div className="global-status" role="status" aria-live="polite">
              <Spinner className="size-4" />
              <span>
                {s?.journey.task?.stage === "calculate"
                  ? "Saved information. Updating forecast…"
                  : s?.journey.task?.stage === "review_progress"
                    ? "Saved information. Coach review in progress…"
                    : "Preparing an update. Your current plan is kept."}
              </span>
            </div>
          )}
        <AlertDialog
          open={pendingHref !== null}
          onOpenChange={(open) => {
            if (!open) setPendingHref(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
              <AlertDialogDescription>
                Your saved information stays unchanged. Keep editing or discard
                these unsaved changes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  const href = pendingHref;
                  setPendingHref(null);
                  setDraftDirty(false);
                  if (href) {
                    const target = new URL(href, window.location.href);
                    if (target.pathname === pathname && target.hash)
                      navigatePlan(target.hash.slice(1));
                    else router.push(href);
                  }
                }}
              >
                Discard and leave
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {s && overlay?.kind === "measurement" && (
          <MeasurementEditor
            initialDate={overlay.date}
            observations={s.logs}
            earliestDate={s.profile.startDate}
            today={app.today}
            error={entryError}
            onClose={() => {
              setOverlay(null);
              setPendingMeasurement(null);
              setEntryError("");
            }}
            onSave={async (fields) => {
              setEntryError("");
              const previous = s.logs.find(
                (entry) => entry.date === fields.date,
              );
              if (
                previous &&
                previous.weightKg === fields.weightKg &&
                JSON.stringify(previous.bodyFat) ===
                  JSON.stringify(fields.bodyFat) &&
                previous.notes === fields.notes
              )
                return true;
              setPendingMeasurement({ fields, before: s });
              void app.journey.updateMeasurement(fields).catch((reason) => {
                setPendingMeasurement(null);
                if (reason instanceof Error && reason.name === "AbortError")
                  return;
                setEntryError(
                  reason instanceof Error
                    ? reason.message
                    : "The update failed. Your saved data is preserved.",
                );
              });
              return false;
            }}
          />
        )}
      </div>
    </ShellContext.Provider>
  );
}
