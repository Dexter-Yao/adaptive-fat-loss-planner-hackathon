"use client";
// ABOUTME: Reuses setup/review over the root-owned candidate while keeping the accepted plan accessible.
// ABOUTME: Cancellation affects only an unaccepted draft; promotion stays an application command.
import { ReplanningScope, useApplication } from "@/application/provider";
import { formatDate } from "@/application/selectors";
import { selectPlanReview } from "@/application/journey-experience-view";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useShell } from "./app-shell";
import { useAppPath } from "./journey-view";
import { OnboardingScreen } from "./onboarding-screen";
import { PlanScreen } from "./plan-screen";
export function ReplanningScreen() {
  const app = useApplication(),
    router = useRouter(),
    path = useAppPath(),
    shell = useShell();
  const seenDraft = useRef(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (app.replanning) seenDraft.current = true;
    else if (seenDraft.current) {
      shell.setDraftDirty(false);
      router.replace(path("/plan"));
    }
  }, [Boolean(app.replanning)]);
  async function command(work: () => Promise<void>) {
    setError("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The change could not be saved.",
      );
    }
  }
  if (!app.hydrated) return null;
  if (!app.session)
    return (
      <Button asChild>
        <Link href={path("/start")}>Start my first plan</Link>
      </Button>
    );
  if (!app.replanning)
    return (
      <section className="replanning-intro">
        <h1>Make a fresh plan</h1>
        <p>Your current plan stays active until you accept a replacement.</p>
        <Button
          onClick={() =>
            command(() => app.replanningCommands.beginReplanning())
          }
        >
          Review my details
        </Button>
        {error && <Alert variant="destructive">{error}</Alert>}
      </section>
    );
  const candidate = app.candidateSession!,
    showSetup =
      app.session.replanning?.step === "setup" ||
      Boolean(candidate.initializationReview?.interpretation?.clarification);
  return (
    <>
      <aside className="replanning-banner" aria-label="New-plan draft">
        <div>
          <strong>New plan · not accepted</strong>
          {showSetup && (
            <p>
              Measurements from {formatDate(candidate.profile.startDate)}.
              Confirm or update the date and details.
            </p>
          )}
        </div>
        <div className="replanning-controls">
          <Button variant="ghost" asChild>
            <Link href={path("/plan")}>View current plan</Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">Cancel new plan</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Discard this new-plan draft?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Your accepted plan, measurements and history will stay. Only
                  this unaccepted draft is discarded.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep working</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    command(() => app.replanningCommands.cancelReplanning())
                  }
                >
                  Discard draft
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </aside>
      {error && (
        <Alert variant="destructive" role="alert">
          {error}
        </Alert>
      )}
      <ReplanningScope>
        {showSetup ? (
          <OnboardingScreen />
        ) : (
          <PlanScreen
            reviewOverride={selectPlanReview(candidate, app.today, app.session)}
          />
        )}
      </ReplanningScope>
    </>
  );
}
