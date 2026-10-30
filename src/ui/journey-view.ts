"use client";
// ABOUTME: Presentation adapter to A's shared workflow projection and commands; no domain state is duplicated.
import { selectJourney } from "@/application/journey-selectors";
import { useApplication } from "@/application/provider";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { workflowErrorText } from "./workflow-error";
export function useAppPath() {
  const pathname = usePathname();
  const prefix = pathname.startsWith("/example") ? "/example" : "";
  return (path: string) => prefix + path;
}
export function useJourneyView() {
  const app = useApplication(),
    [error, setError] = useState("");
  async function run(command: () => void | Promise<unknown>) {
    setError("");
    app.clearError();
    try {
      await command();
      return true;
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") return false;
      setError(
        reason instanceof Error
          ? workflowErrorText(reason.message)
          : "That change could not be completed. Your saved information is preserved.",
      );
      return false;
    }
  }
  return {
    app,
    view: app.session
      ? selectJourney(app.session, app.today, app.journey.running)
      : null,
    error,
    run,
  };
}
