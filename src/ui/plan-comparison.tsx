// ABOUTME: Reviewable current/proposed differences from a read-only application projection.
// ABOUTME: Original Agent prose remains verbatim; numbers come only from calculated target records.
import type { PlanReviewView } from "@/application/journey-experience-view";
import { formatDate } from "@/application/selectors";
import { Card, CardContent } from "@/components/ui/card";
import { Disclosure } from "./task-components";
import { JourneyWeek } from "./journey-week";
import { feedbackPriorities } from "./labels";

export function PlanComparison({ review }: { review: PlanReviewView }) {
  const { previous, draft, feedback } = review;
  if (!previous) return null;
  return (
    <Card id="plan-comparison" className="plan-comparison">
      <CardContent>
        <h2>What would change</h2>
        {feedback && (
          <Disclosure title="Your feedback for this version">
            <ul>
              {feedback.priorities.map((p) => (
                <li key={p}>
                  {feedbackPriorities.find(([id]) => id === p)?.[1]}
                </li>
              ))}
            </ul>
            {feedback.availableTrainingMinutes != null && (
              <p>
                Available activity time: {feedback.availableTrainingMinutes}{" "}
                minutes/week
              </p>
            )}
            {feedback.requestedGoalDate && (
              <p>
                Requested goal date: {formatDate(feedback.requestedGoalDate)}
              </p>
            )}
            {feedback.notes && (
              <blockquote className="feedback-quote">
                {feedback.notes}
              </blockquote>
            )}
            <p className="field-hint">
              These are your requests. Check the proposed content below to see
              what was actually addressed.
            </p>
          </Disclosure>
        )}
        {review.guidanceChanged === false && (
          <p className="field-hint">
            The strategy and weekly guidance are unchanged in this version.
            Review whether it addresses your feedback before accepting.
          </p>
        )}
        <div className="comparison-columns">
          <section>
            <h3>{review.previousLabel}</h3>
            <dl>
              {review.currentGoal && (
                <>
                  <dt>Goal</dt>
                  <dd>
                    {review.currentGoal.value.toFixed(1)}
                    {review.currentGoal.kind === "weight"
                      ? " kg"
                      : "% body fat"}
                  </dd>
                </>
              )}
              <dt>Plan finish</dt>
              <dd>{formatDate(previous.binding.endsOn)}</dd>
              {review.currentTarget && (
                <>
                  <dt>Accepted intake target</dt>
                  <dd>
                    {review.currentTarget.dailyCalories.toLocaleString("en-US")}{" "}
                    kcal/day
                  </dd>
                </>
              )}
            </dl>
          </section>
          <section>
            <h3>Proposed plan · not accepted</h3>
            <dl>
              <dt>Proposed goal</dt>
              <dd>
                {review.proposedGoal.value.toFixed(1)}
                {review.proposedGoal.kind === "weight" ? " kg" : "% body fat"}
              </dd>
              <dt>Plan finish</dt>
              <dd>{formatDate(draft.binding.endsOn)}</dd>
              {review.proposedTarget && (
                <>
                  <dt>
                    {review.targetIsAccepted
                      ? "Intake target · unchanged"
                      : "Proposed intake target"}
                  </dt>
                  <dd>
                    {review.proposedTarget.dailyCalories.toLocaleString(
                      "en-US",
                    )}{" "}
                    kcal/day
                  </dd>
                  <dt>
                    {review.targetIsAccepted
                      ? "Already effective from"
                      : "Would take effect"}
                  </dt>
                  <dd>{formatDate(review.proposedTarget.effectiveFrom)}</dd>
                </>
              )}
            </dl>
          </section>
        </div>
        <Disclosure title="Compare the whole approach">
          <div className="comparison-columns">
            <section>
              <h3>{review.previousLabel}</h3>
              <p className="generated-copy">{previous.content.summary}</p>
            </section>
            <section>
              <h3>Proposed plan · not accepted</h3>
              <p className="generated-copy">{draft.content.summary}</p>
            </section>
          </div>
        </Disclosure>
        {review.weeks.length > 0 && (
          <Disclosure title="Compare weekly guidance">
            {review.weeks.map(({ proposed, previous: week }) => (
              <Disclosure
                key={proposed.weekStart}
                title={`Week of ${formatDate(proposed.weekStart)}`}
              >
                <div className="comparison-columns">
                  <section>
                    <h4>{review.previousLabel}</h4>
                    {week ? (
                      <>
                        <p>{week.focus}</p>
                        <JourneyWeek
                          actions={week.actions}
                          checkIn={week.checkIn}
                        />
                      </>
                    ) : (
                      <p>No guidance for this week in that version.</p>
                    )}
                  </section>
                  <section>
                    <h4>Proposed</h4>
                    <p>{proposed.focus}</p>
                    <JourneyWeek
                      actions={proposed.actions}
                      checkIn={proposed.checkIn}
                    />
                  </section>
                </div>
              </Disclosure>
            ))}
          </Disclosure>
        )}
      </CardContent>
    </Card>
  );
}
