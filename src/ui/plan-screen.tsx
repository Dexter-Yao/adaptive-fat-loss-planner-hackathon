"use client";
// ABOUTME: Selects one Plan surface: accepted overview, full-plan reading or an unaccepted proposal review.
// ABOUTME: Location controls presentation only; proposals, permissions and all accepted facts stay application-owned.
import type { PlanReviewView } from "@/application/journey-experience-view";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AcceptedJourney } from "./accepted-journey";
import { JourneyStatus } from "./journey-status";
import { useJourneyView } from "./journey-view";
import { parsePlanLocation, usePlanLocation } from "./plan-navigation";
import { ProposalReview } from "./proposal-review";
import { SetupNavigation } from "./setup-navigation";
import { EmptyTask } from "./task-components";
import { workflowErrorText } from "./workflow-error";

export function PlanScreen({
  reviewOverride,
}: { reviewOverride?: PlanReviewView | null } = {}) {
  const { app, view, run, error } = useJourneyView();
  const hash = usePlanLocation(),
    destination = parsePlanLocation(hash);
  const s = app.session;
  if (!s || !view) return null;
  const reviewing =
    Boolean(view.proposal) &&
    (!view.plan || !["overview", "full-plan"].includes(destination.view));
  const taskStage = s.journey.task?.stage ?? "";
  return (
    <>
      {error && !view.error && (
        <Alert variant="destructive" role="alert">
          {workflowErrorText(error)}
        </Alert>
      )}
      {(!view.hasAcceptedJourney ||
        ((app.journey.running ||
          ["recovery", "blocked"].includes(view.phase)) &&
          !["calculate", "review_progress"].includes(taskStage))) && (
        <JourneyStatus />
      )}
      {reviewing ? (
        <ProposalReview reviewOverride={reviewOverride} />
      ) : view.plan ? (
        <AcceptedJourney hash={hash} pendingProposal={Boolean(view.proposal)} />
      ) : !app.journey.running &&
        !["recovery", "blocked", "clarification"].includes(view.phase) ? (
        <EmptyTask
          title="Your whole plan starts here"
          description="A calculated outlook and a practical weekly journey, reviewed by you."
        >
          <SetupNavigation label="Continue setup" />
          {!s.journey.enabled && (
            <Button
              variant="outline"
              onClick={() => run(() => app.journey.adoptExisting())}
            >
              Build from my saved details
            </Button>
          )}
        </EmptyTask>
      ) : null}
    </>
  );
}
