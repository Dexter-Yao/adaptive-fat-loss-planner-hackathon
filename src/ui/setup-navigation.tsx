"use client";
// ABOUTME: Setup navigation respects the active/candidate scope instead of leaving a replan for the old plan's setup.
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useAppPath, useJourneyView } from "./journey-view";
export function SetupNavigation({ label }: { label: string }) {
  const { app, run, error } = useJourneyView(),
    path = useAppPath();
  if (app.scope !== "replanning")
    return (
      <Button variant="outline" asChild>
        <Link href={path("/start")}>{label}</Link>
      </Button>
    );
  return (
    <>
      <Button
        variant="outline"
        onClick={() =>
          run(() =>
            app.replanningCommands.updateReplanningSetup(app.replanning!.input),
          )
        }
      >
        {label}
      </Button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
