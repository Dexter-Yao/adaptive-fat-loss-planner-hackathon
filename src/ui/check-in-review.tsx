"use client";
// ABOUTME: Connects Plan and Records to the same frozen check-in presentation and existing application commands.
// ABOUTME: Only feedback-form visibility is local; calculation, review and acceptance remain application-owned.
import { selectCheckInExperience } from "@/application/journey-experience-view";
import { useEffect, useRef, useState } from "react";
import { formatDate } from "@/application/selectors";
import { useShell } from "./app-shell";
import { CheckInResult, checkInStatus } from "./check-in-result";
import { useAppPath, useJourneyView } from "./journey-view";
import { PlanRevisionForm } from "./plan-revision-form";
import { Disclosure } from "./task-components";
import { usePlanLocation } from "./plan-navigation";

export function CheckInReview({ inRecords = false }: { inRecords?: boolean }) {
  const { app, view, run, error } = useJourneyView(),
    shell = useShell(),
    path = useAppPath();
  const [feedback, setFeedback] = useState(false),
    [expanded, setExpanded] = useState(false);
  const location = usePlanLocation();
  useEffect(() => {
    if (location === "#update-result") setExpanded(true);
  }, [location]);
  const update =
    app.session && view?.hasAcceptedJourney
      ? selectCheckInExperience(app.session, app.today, app.journey.running)
      : null;
  const marker = `${app.session?.sourceRevision}:${update?.review?.binding.requestId}`;
  const preceding = useRef(marker);
  useEffect(() => {
    if (preceding.current !== marker && (update?.latest || update?.review))
      setExpanded(true);
    preceding.current = marker;
  }, [marker, Boolean(update?.latest), Boolean(update?.review)]);
  if (!update || (!update.latest && !update.task && !update.review))
    return null;
  const noteOnly =
    update.latest && update.latest.weightKg == null && !update.latest.bodyFat;
  return (
    <>
      <section id="update-result" aria-label="Latest saved check-in">
        <Disclosure
          className="check-in-disclosure"
          open={expanded || Boolean(update.task)}
          onOpenChange={setExpanded}
          title={
            <span className="check-in-summary">
              <strong>
                {update.latest
                  ? `${noteOnly ? "Latest note" : "Latest check-in"} · ${formatDate(update.latest.date)}`
                  : "Your check-in feedback"}
              </strong>
              <span>{checkInStatus(update)}</span>
            </span>
          }
        >
          <CheckInResult
            update={update}
            busy={app.journey.running}
            onReview={() => {
              void run(() => app.journey.reviewProgress(true));
            }}
            onRetry={() => {
              void run(() => app.journey.retry());
            }}
            onCancel={() => {
              void run(() => app.journey.cancel());
            }}
            onRecalculate={() => {
              void run(() => app.journey.recalculate(true));
            }}
            onRemeasure={() => shell.record()}
            onRevise={() => setFeedback(true)}
            onDismiss={() => {
              void run(() => app.journey.dismissReview());
            }}
            recordsHref={inRecords ? path("/plan#update-result") : undefined}
            proposalHref={view?.proposal ? path("/plan#review") : undefined}
            error={error}
          />
        </Disclosure>
      </section>
      {feedback && <PlanRevisionForm onClose={() => setFeedback(false)} />}
    </>
  );
}
