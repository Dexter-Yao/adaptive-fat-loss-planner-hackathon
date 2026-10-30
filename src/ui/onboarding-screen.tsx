"use client";
// ABOUTME: Initial fact collection dispatches A's setup command and then opens its persisted review workflow.
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useShell } from "./app-shell";
import { usePreview } from "./experience-host";
import { useAppPath, useJourneyView } from "./journey-view";
import { SetupForm } from "./setup-form";
import { EmptyTask } from "./task-components";
export function OnboardingScreen() {
  const preview = usePreview();
  const { app, view, run, error } = useJourneyView(),
    shell = useShell(),
    router = useRouter(),
    path = useAppPath(),
    [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (
      submitted &&
      app.scope !== "replanning" &&
      app.session?.journey.enabled
    ) {
      shell.setDraftDirty(false);
      router.replace(path("/plan"));
    }
  }, [submitted, app.session?.journey.enabled, router]);
  useEffect(() => () => shell.setDraftDirty(false), [shell.setDraftDirty]);
  if (view?.hasAcceptedJourney)
    return (
      <EmptyTask
        title="Your plan is already underway"
        description="Your starting measurements remain its baseline. Add a check-in to update progress, or review a proposed plan change."
      >
        <Button asChild>
          <Link href={path("/plan")}>Back to my plan</Link>
        </Button>
      </EmptyTask>
    );
  return (
    <>
      {app.session?.initializationReview?.interpretation?.clarification && (
        <Alert className="mb-4">
          {app.session.initializationReview.interpretation.clarification}
        </Alert>
      )}
      <SetupForm
        today={app.today}
        timezone={
          app.session?.profile.timezone ??
          Intl.DateTimeFormat().resolvedOptions().timeZone
        }
        initial={
          app.session
            ? {
                profile: app.session.profile,
                goal: app.session.goal,
                preferences: app.session.preferences,
              }
            : undefined
        }
        busy={app.journey.running}
        error={error}
        onDirty={shell.setDraftDirty}
        onSubmit={async (input) => {
          setSubmitted(true);
          await run(async () => {
            if (app.session) {
              await app.journey.updateSetup(input);
              await app.journey.generate();
            } else await app.journey.start(input, Boolean(preview));
          });
        }}
      />
    </>
  );
}
