"use client";
// ABOUTME: Honest workflow progress and recovery controls, derived from A's persisted task.
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SetupNavigation } from "./setup-navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useJourneyView } from "./journey-view";
import { workflowErrorText } from "./workflow-error";
import { Disclosure } from "./task-components";
const titles = {
  interpreting: "Understanding your routine",
  calculating: "Calculating the outlook",
  generating: "Building your whole plan",
  revising: "Working with your feedback",
  reviewing_progress: "Reviewing what changed",
  accepting: "Checking and saving your plan",
} as const;
export function JourneyStatus() {
  const { app, view, run, error } = useJourneyView();
  if (!view || !app.session) return null;
  const phase = view.phase,
    title = titles[phase as keyof typeof titles];
  if (title)
    return (
      <Card className="workflow-status">
        <CardContent>
          <div className="flex items-center gap-3">
            <Spinner />
            <h2>{title}</h2>
          </div>
          <p>
            {phase === "accepting"
              ? "Checking the current calculation before saving your acceptance."
              : view.hasAcceptedJourney
                ? "Your saved measurements and accepted plan remain available."
                : "Your details are saved. You will review the full plan before accepting it."}{" "}
            This can take a little time.
          </p>
          <Button
            variant="ghost"
            onClick={() => run(() => app.journey.cancel())}
          >
            Pause this request
          </Button>
        </CardContent>
      </Card>
    );
  if (phase === "clarification")
    return (
      <Alert className="workflow-status">
        <AlertTitle>One detail to clarify</AlertTitle>
        <AlertDescription>
          <p>
            {app.session.initializationReview?.interpretation?.clarification}
          </p>
          <SetupNavigation label="Review my details" />
        </AlertDescription>
      </Alert>
    );
  if (phase === "recovery")
    return (
      <Alert className="workflow-status">
        <AlertTitle>
          {app.session.journey.task?.stage === "generate" &&
          app.session.journey.task.status === "failed"
            ? "Plan generation failed"
            : "Saved, with an update still to finish"}
        </AlertTitle>
        <AlertDescription>
          <p>
            {workflowErrorText(
              view.error || "The previous request was interrupted.",
            )}
          </p>
          <p>Your saved information is preserved. Retry when you are ready.</p>
          {view.error && workflowErrorText(view.error) !== view.error && (
            <Disclosure title="Technical details">
              <pre className="generated-copy">{view.error}</pre>
            </Disclosure>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run(() => app.journey.retry())}>
              {app.session.journey.task?.stage === "generate"
                ? "Retry plan generation"
                : "Retry update"}
            </Button>
            {!view.hasAcceptedJourney && (
              <SetupNavigation label="Review setup" />
            )}
          </div>
          {error &&
            workflowErrorText(error) !==
              workflowErrorText(view.error ?? "") && (
              <p role="alert">{workflowErrorText(error)}</p>
            )}
        </AlertDescription>
      </Alert>
    );
  if (phase === "blocked")
    return (
      <Alert className="workflow-status">
        <AlertTitle>
          {app.session.snapshot?.decision.title ??
            "Review your starting information"}
        </AlertTitle>
        <AlertDescription>
          <p>
            {app.session.snapshot?.decision.summary ??
              "A usable forecast is not available for these inputs."}
          </p>
          <p>Measurements can still be saved and corrected.</p>
          {!view.hasAcceptedJourney && <SetupNavigation label="Review setup" />}
        </AlertDescription>
      </Alert>
    );
  return null;
}
