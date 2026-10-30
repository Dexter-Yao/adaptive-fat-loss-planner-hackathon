"use client";
// ABOUTME: Dedicated proposal review; accepted overview and full-plan reading are rendered elsewhere.
// ABOUTME: Exact proposals and all decision permissions come from the existing frozen application projections.
import { formatDate, goalLabel } from "@/application/selectors";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { selectMeasurementExperience } from "@/application/measurement-view";
import {
  selectPlanReview,
  type PlanReviewView,
} from "@/application/journey-experience-view";
import { useEffect, useRef, useState } from "react";
import { useShell } from "./app-shell";
import { ForecastChart } from "./forecast-chart";
import { JourneyFeedbackForm } from "./journey-feedback-form";
import { JourneyOverview } from "./journey-overview";
import { PlanComparison } from "./plan-comparison";
import { ModelDetails } from "./model-details";
import { useJourneyView } from "./journey-view";
import { Disclosure } from "./task-components";
import { SetupNavigation } from "./setup-navigation";
import { dateRangeLabel } from "./labels";
import { navigatePlan } from "./plan-navigation";
import { ExplanationDialog } from "./explanation-dialog";
import { workflowErrorText } from "./workflow-error";
export function ProposalReview({
  reviewOverride,
}: {
  reviewOverride?: PlanReviewView | null;
}) {
  const { app, view, run, error } = useJourneyView(),
    shell = useShell();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (window.location.hash) return;
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view?.proposal?.draft.id, view?.hasAcceptedJourney]);
  const s = app.session;
  if (!s || !view) return null;
  const proposal = view.proposal,
    busy = app.journey.running,
    proposedPoint = selectMeasurementExperience(s, app.today).proposalEndpoint,
    review = reviewOverride ?? selectPlanReview(s, app.today),
    replacement = review?.replacement ?? view.hasAcceptedJourney;

  if (!proposal) return null;
  return (
    <section id="review" className="proposal-section">
      {error && !feedbackOpen && !view.error && (
        <Alert variant="destructive" role="alert">
          {workflowErrorText(error)}
        </Alert>
      )}
      <div className="page-title">
        <div>
          <h1 ref={heading} tabIndex={-1}>
            {replacement
              ? "Review a plan alternative"
              : "Review your whole plan"}
          </h1>
          <p className="subtle">
            {dateRangeLabel(
              proposal.draft.binding.startsOn,
              proposal.draft.binding.endsOn,
            )}{" "}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {proposal.draft.feedbackRevision > 0 && (
            <span className="meta">
              Revision {proposal.draft.feedbackRevision}
            </span>
          )}
          <ExplanationDialog
            title="About this proposal"
            description="Calculated targets and your decision"
          >
            <p>
              The calculator checks the targets and the Hall forecast. The coach
              uses those results and your circumstances to propose the complete
              plan.
            </p>
            <p>
              Nothing takes effect until you accept. You can request up to three
              feedback revisions.
            </p>
          </ExplanationDialog>
        </div>
      </div>
      {view.hasAcceptedJourney && app.scope !== "replanning" && (
        <Button asChild variant="outline">
          <a data-plan-view href="#overview">
            View current accepted plan
          </a>
        </Button>
      )}
      <p className="review-introduction">
        {replacement
          ? "Not accepted. Your current plan stays active."
          : "Not accepted yet. Review the plan, then accept or request changes."}
      </p>
      <nav className="plan-shortcuts" aria-label="Review this proposal">
        {review?.previous && <a href="#plan-comparison">Compare versions</a>}
        <a href="#proposal-journey">Read the whole approach</a>
        <a href="#plan-decision">Accept or request changes</a>
      </nav>
      {s.goal.requestedDate &&
        s.goal.requestedDate !== proposal.draft.binding.endsOn && (
          <p className="field-hint">
            Requested deadline: {formatDate(s.goal.requestedDate)}. The proposed
            plan ends {formatDate(proposal.draft.binding.endsOn)}.
          </p>
        )}
      <Card className="journey-numbers">
        <CardContent>
          <div>
            <span>Your goal</span>
            <strong>{goalLabel(s)}</strong>
          </div>
          <div>
            <span>Proposed daily intake</span>
            <strong>
              {proposal.calculation?.proposedTargets.at(-1)?.dailyCalories !=
              null
                ? `${proposal.calculation!.proposedTargets.at(-1)!.dailyCalories.toLocaleString("en-US")} kcal`
                : "Review required"}
            </strong>
          </div>
          <div>
            <span>Forecast at plan end</span>
            <strong>
              {proposedPoint
                ? s.goal.kind === "weight"
                  ? `${proposedPoint.weightKg.toFixed(1)} kg`
                  : `${proposedPoint.bodyFatPct?.toFixed(1) ?? "—"}%`
                : "Unavailable"}
            </strong>
          </div>
        </CardContent>
      </Card>
      {review?.feasibility?.requiredNotice && (
        <p role="note" className="field-hint">
          {review.feasibility.requiredNotice}
        </p>
      )}
      {review && <PlanComparison review={review} />}
      <section id="proposal-journey">
        <Disclosure
          title="Read the complete proposal"
          defaultOpen={!review?.previous}
        >
          <JourneyOverview content={proposal.draft.content} />
        </Disclosure>
      </section>
      {proposal.calculation?.snapshot.forecast && (
        <Disclosure title="Expected progress and assumptions">
          <p>{proposal.calculation.snapshot.decision.summary}</p>
          <ForecastChart
            forecast={proposal.calculation.snapshot.forecast}
            profile={s.profile}
            logs={s.logs}
            metric={s.goal.kind}
            goalValue={s.goal.value}
          />
          <p className="field-hint">
            A conditional forecast using the proposed targets and confirmed
            activity assumptions. Your actual results may differ.
          </p>
          <ul>
            {proposal.calculation.snapshot.forecast.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
          <Disclosure title="Forecast models and assumptions">
            <ModelDetails
              forecast={proposal.calculation.snapshot.forecast}
              profile={s.profile}
              logs={s.logs}
            />
          </Disclosure>
        </Disclosure>
      )}
      {proposal.stale && view.phase !== "feedback_limit" && (
        <Alert>
          The inputs changed after this proposal. Rebuild it before accepting.
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => run(() => app.journey.generate())}
          >
            Rebuild proposal
          </Button>
        </Alert>
      )}
      <section id="plan-decision" aria-label="Your plan decision">
        {view.phase === "feedback_limit" ? (
          <Alert>
            <strong>Three revisions completed.</strong>
            <p>
              {replacement
                ? "Your current plan stays active. This revision was not accepted."
                : "No plan was accepted."}{" "}
              Your feedback and proposals are saved.
            </p>
            {view.hasAcceptedJourney ? (
              <Button
                variant="outline"
                onClick={async () => {
                  const ok = await run(() => app.journey.dismissProposal());
                  if (ok) navigatePlan("overview", { replace: true });
                }}
              >
                Keep my current plan
              </Button>
            ) : (
              <SetupNavigation label="Revisit your setup" />
            )}
          </Alert>
        ) : feedbackOpen ? (
          <Card className="feedback-card">
            <CardContent>
              <h2>What would make this more workable?</h2>
              <p className="subtle">
                {proposal.feedbackRevisionsRemaining > 0
                  ? `${proposal.feedbackRevisionsRemaining} revisions remaining.`
                  : replacement
                    ? "This is the last version. If it still does not fit, your current plan stays active."
                    : "This is the last version. If it still does not fit, we will save your feedback so you can revisit setup."}
              </p>
              <JourneyFeedbackForm
                busy={busy}
                submitLabel={
                  proposal.feedbackRevisionsRemaining > 0
                    ? "Revise my plan"
                    : "Save feedback"
                }
                error={error}
                minDate={app.today}
                onDirty={shell.setDraftDirty}
                onCancel={() => {
                  setFeedbackOpen(false);
                  shell.setDraftDirty(false);
                }}
                onSubmit={async (value) => {
                  const ok = await run(() =>
                    app.journey.feedback({
                      ...value,
                      draftId: proposal.draft.id,
                      sourceRevision: s.sourceRevision,
                    }),
                  );
                  if (ok) {
                    shell.setDraftDirty(false);
                    setFeedbackOpen(false);
                  }
                }}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="review-actions">
            <p>
              {replacement
                ? "Your current plan stays in place."
                : "Accept to begin."}
            </p>
            <div>
              <Button
                variant="outline"
                disabled={busy || proposal.stale}
                onClick={() => setFeedbackOpen(true)}
              >
                {proposal.feedbackRevisionsRemaining > 0
                  ? "Request changes"
                  : "Decline this version"}
              </Button>
              {view.hasAcceptedJourney && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={async () => {
                    const ok = await run(() => app.journey.dismissProposal());
                    if (ok) navigatePlan("overview", { replace: true });
                  }}
                >
                  Keep current plan
                </Button>
              )}
              <Button
                disabled={busy || !proposal.canAccept}
                onClick={async () => {
                  const ok = await run(() => app.journey.accept());
                  if (ok && app.scope !== "replanning")
                    navigatePlan("overview", { replace: true });
                }}
              >
                {app.scope === "replanning"
                  ? "Use this new plan"
                  : "Accept this plan"}
              </Button>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
