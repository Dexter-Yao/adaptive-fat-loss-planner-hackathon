"use client";
// ABOUTME: Shared check-in receipt, calculation and coach decision, consuming the frozen presentation contract.
// ABOUTME: Status comes from the application; this component never infers freshness, eligibility or successful persistence.
import type { CheckInExperienceView } from "@/application/journey-experience-contract";
import { formatDate } from "@/application/selectors";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { Disclosure } from "./task-components";
import { workflowErrorText } from "./workflow-error";
import { coachRecommendationLabels as titles } from "./labels";
import { ExplanationDialog } from "./explanation-dialog";

/** The calculator-owned common-date comparison stays separate from a measured residual. */
export function ForecastChangeExplanation({
  change,
}: {
  change: NonNullable<CheckInExperienceView["forecastChange"]>;
}) {
  return (
    <>
      <p>
        Hall prediction for{" "}
        {formatDate(change.date, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}{" "}
        · current minus accepted reference.
      </p>
      <p>
        Two conditional forecasts for the same future date, not today's
        measurement error or measured tissue change.
      </p>
    </>
  );
}

/** Short receipt of separate calculation/review states, without redefining their application-owned eligibility. */
export function checkInStatus(update: CheckInExperienceView): string {
  const { task } = update;
  const forecast = !update.numbersFresh
    ? "Forecast pending"
    : update.forecastAvailable
      ? "Forecast ready"
      : "Forecast withheld";
  if (task?.stage === "calculate")
    return task.working
      ? "Saved · updating forecast"
      : "Saved · forecast update needs retry";
  if (task?.stage === "review_progress")
    return `${forecast} · coach review ${task.working ? "in progress" : "needs retry"}`;
  if (update.review) return titles[update.review.result.recommendation];
  return forecast;
}

export function CheckInResult({
  update,
  busy,
  onReview,
  onRetry,
  onCancel,
  onRecalculate,
  onRemeasure,
  onRevise,
  onDismiss,
  recordsHref,
  proposalHref,
  error,
}: {
  update: CheckInExperienceView;
  busy: boolean;
  onReview: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onRecalculate: () => void;
  onRemeasure: () => void;
  onRevise: () => void;
  onDismiss: () => void;
  recordsHref?: string;
  proposalHref?: string;
  error?: string;
}) {
  const { latest, task, review: coach, forecastChange: change } = update;
  if (!latest && !task && !coach) return null;
  const suggestsChange =
    coach &&
    ["adjust_execution", "revise_plan"].includes(coach.result.recommendation);
  const quiet =
    !task &&
    !coach &&
    update.numbersFresh &&
    update.forecastAvailable &&
    update.guidanceFresh;
  return (
    <section className="update-result" aria-label="Your check-in and next step">
      <Card className="check-in-consequence">
        <CardContent>
          <div className="check-in-facts">
            <div className="check-in-saved">
              <p className="check-in-receipt">
                <Check aria-hidden />
                {latest
                  ? `Check-in saved · ${formatDate(latest.date)}`
                  : "Your saved information is kept"}
              </p>
              {latest && (
                <p className="saved-readings">
                  {latest.weightKg != null && (
                    <span>{latest.weightKg.toFixed(1)} kg</span>
                  )}
                  {latest.bodyFat && (
                    <span>
                      {latest.bodyFat.percent.toFixed(1)}% body fat ·{" "}
                      {latest.bodyFat.method.toUpperCase()}
                    </span>
                  )}
                  {latest.weightKg == null && !latest.bodyFat && (
                    <span>Note-only update · no new measurement</span>
                  )}
                </p>
              )}
              {latest?.notes && (
                <Disclosure title="Your saved note">
                  <blockquote className="generated-copy">
                    {latest.notes}
                  </blockquote>
                </Disclosure>
              )}
            </div>
            <div className="check-in-forecast" aria-label="Calculation status">
              <div className="section-title">
                <span className="meta">Forecast</span>
                {change && (
                  <ExplanationDialog
                    title="About this forecast change"
                    description="Two forecasts for one future date"
                  >
                    <ForecastChangeExplanation change={change} />
                  </ExplanationDialog>
                )}
              </div>
              <p>
                {task?.stage === "calculate" && task.working
                  ? "Calculation in progress"
                  : !update.numbersFresh
                    ? "Not yet updated for the current information"
                    : update.forecastAvailable
                      ? "Forecast ready"
                      : "Numerical forecast withheld"}
              </p>
              {update.numbersFresh &&
                update.forecastAvailable &&
                (change?.value != null ? (
                  <div className="forecast-change">
                    <strong>
                      {new Intl.NumberFormat("en-US", {
                        signDisplay: "always",
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      }).format(change.value)}{" "}
                      {change.unit}
                    </strong>
                    <span>
                      Forecast change at{" "}
                      {formatDate(change.date, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}{" "}
                    </span>
                  </div>
                ) : (
                  <p className="field-hint">
                    A same-date comparison with the accepted reference is
                    unavailable.
                  </p>
                ))}
            </div>
          </div>
          <div className="check-in-coach" aria-live="polite" aria-atomic="true">
            {!quiet && (
              <p className="eyebrow">
                {task?.stage === "calculate" ? "Next step" : "Coach review"}
              </p>
            )}
            {quiet ? (
              <>
                {update.canRequestReview && (
                  <Button variant="outline" disabled={busy} onClick={onReview}>
                    Ask coach to review
                  </Button>
                )}
              </>
            ) : task ? (
              <>
                <h2>
                  {task.working && <Spinner aria-hidden />}
                  {task.working
                    ? task.stage === "calculate"
                      ? "Waiting for the calculation"
                      : "Coach review in progress"
                    : `${task.stage === "calculate" ? "Forecast update" : "Coach review"} ${task.error ? "failed" : "interrupted"}`}
                </h2>
                <p>
                  {task.working
                    ? "Your current plan stays active."
                    : workflowErrorText(
                        task.error ??
                          "The previous request was interrupted. Your saved check-in is kept.",
                      )}
                </p>
                {!task.working && (
                  <p className="field-hint">
                    Retry without entering the check-in again.
                  </p>
                )}
                <Button
                  variant="outline"
                  disabled={!task.working && busy}
                  onClick={task.working ? onCancel : onRetry}
                >
                  {task.working
                    ? `Pause ${task.stage === "calculate" ? "forecast update" : "coach review"}`
                    : `Retry ${task.stage === "calculate" ? "forecast update" : "coach review"}`}
                </Button>
              </>
            ) : coach ? (
              <>
                <h2>{titles[coach.result.recommendation]}</h2>
                <p className="generated-copy">{coach.result.summary}</p>
                {coach.result.proposedChangeSummary && (
                  <div className="coach-next-step">
                    <strong>
                      {suggestsChange
                        ? "Suggested adjustment · not applied"
                        : "Suggested next step"}
                    </strong>
                    <p className="generated-copy">
                      {coach.result.proposedChangeSummary}
                    </p>
                  </div>
                )}
                {coach.result.question && (
                  <p className="coach-question generated-copy">
                    {coach.result.question}
                  </p>
                )}
                <Disclosure title="Why this recommendation?">
                  <p className="meta">
                    Reviewed {formatDate(coach.binding.asOfDate)}
                  </p>
                  <p className="generated-copy">{coach.result.uncertainty}</p>
                  {coach.result.evidence.map((e, i) => (
                    <div key={i}>
                      {e.sourceId === "forecast" ? (
                        <h3>Forecast comparison and assumptions</h3>
                      ) : (
                        <blockquote className="generated-copy">
                          {e.quote}
                        </blockquote>
                      )}
                      <p className="generated-copy">{e.reason}</p>
                    </div>
                  ))}
                </Disclosure>
                {suggestsChange && (
                  <p className="field-hint">
                    Your accepted plan has not changed.
                  </p>
                )}
                {!update.guidanceFresh && (
                  <p className="field-hint">
                    Plan guidance still awaits review.
                  </p>
                )}
                <div className="decision-actions">
                  {suggestsChange &&
                    (proposalHref ? (
                      <Button asChild>
                        <Link href={proposalHref}>
                          Review the pending alternative
                        </Link>
                      </Button>
                    ) : (
                      <Button disabled={busy} onClick={onRevise}>
                        Review a plan alternative
                      </Button>
                    ))}
                  {coach.result.recommendation === "remeasure" && (
                    <Button onClick={onRemeasure}>Add a measurement</Button>
                  )}
                  <Button variant="outline" disabled={busy} onClick={onDismiss}>
                    {suggestsChange ? "Keep my current plan" : "Got it"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h2>
                  {!update.numbersFresh
                    ? "Waiting for an updated calculation"
                    : !update.guidanceFresh
                      ? "Not reviewed for this update"
                      : "No new coach conclusion"}
                </h2>
                <p className="field-hint">
                  {!update.numbersFresh
                    ? "The saved forecast does not include the current information yet."
                    : !update.forecastAvailable
                      ? "The calculator withheld a numerical forecast. You can still save measurements and request a review."
                      : !update.guidanceFresh
                        ? "Saved guidance has not been reviewed for this update."
                        : "Ask for a review if your circumstances have changed."}
                </p>
                <div className="decision-actions">
                  {!update.numbersFresh && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={onRecalculate}
                    >
                      Update forecast
                    </Button>
                  )}
                  {update.canRequestReview && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={onReview}
                    >
                      Ask coach to review
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
          {proposalHref && !suggestsChange && (
            <div className="check-in-coach">
              <p className="field-hint">
                A plan alternative is saved · not accepted. Your accepted plan
                is still active.
              </p>
              <Button asChild variant="outline">
                <Link href={proposalHref}>Review the pending alternative</Link>
              </Button>
            </div>
          )}
          {recordsHref && (
            <Button asChild variant="ghost">
              <Link href={recordsHref}>
                See my plan and forecast <ArrowRight aria-hidden />
              </Link>
            </Button>
          )}
          {error && !task?.error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
