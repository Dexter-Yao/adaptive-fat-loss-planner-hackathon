"use client";
// ABOUTME: Mutually exclusive accepted-plan overview and full-plan reader share one full-width page frame.
// ABOUTME: Numerical state and guidance gates are application projections; URL selection never changes business facts.
import { selectGoalProgress } from "@/application/goal-progress-view";
import { selectJourneyChartInput } from "@/application/journey-chart-view";
import { selectMeasurementExperience } from "@/application/measurement-view";
import { formatDate } from "@/application/selectors";
import { activeAcceptance } from "@/application/journey-commands";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useShell } from "./app-shell";
import { CheckInReview } from "./check-in-review";
import { ForecastPanel } from "./forecast-panel";
import { ForecastDetails } from "./forecast-details";
import { FullPlanReader } from "./full-plan-reader";
import { GoalSummary } from "./goal-summary";
import { JourneyWeek } from "./journey-week";
import { useAppPath, useJourneyView } from "./journey-view";
import { MeasurementAction } from "./measurement-action";
import { navigatePlan, parsePlanLocation } from "./plan-navigation";
import { PlanRevisionForm } from "./plan-revision-form";
import { PlanFocus } from "./plan-focus";

export function AcceptedJourney({
  hash,
  pendingProposal = false,
}: {
  hash: string;
  pendingProposal?: boolean;
}) {
  const { app, view } = useJourneyView(),
    shell = useShell(),
    path = useAppPath();
  const heading = useRef<HTMLHeadingElement>(null);
  const [feedback, setFeedback] = useState(false),
    [phaseDate, setPhaseDate] = useState<string | null>(null),
    [chosenMetric, setMetric] = useState<"weight" | "body_fat" | null>(null);
  const destination = parsePlanLocation(hash),
    tab = destination.view === "full-plan" ? "full-plan" : "overview";
  useEffect(() => {
    if (
      ["#progress", "#models", "#weekly-guidance", "#update-result"].includes(
        window.location.hash,
      )
    ) {
      requestAnimationFrame(() =>
        document.querySelector(window.location.hash)?.scrollIntoView(),
      );
    } else {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, []);
  const s = app.session;
  if (!s || !view?.plan) return null;
  const metric = chosenMetric ?? s.goal.kind,
    progress = selectGoalProgress(s, app.today, metric),
    chartInput = selectJourneyChartInput(s, app.today, progress.summary),
    display = selectMeasurementExperience(s, app.today),
    selectedPhase =
      display.phases.find((p) => p.startsOn === phaseDate) ??
      display.phases.find((p) => p.current) ??
      display.phases[0],
    acceptance = activeAcceptance(s),
    acceptedDraft = s.journey.drafts.find((d) => d.id === acceptance?.draftId);
  function checkIn(date?: string) {
    if (tab !== "overview") navigatePlan("overview");
    shell.record(date);
  }
  return (
    <section className="accepted-plan">
      <div className="page-title">
        <div>
          <h1 ref={heading} tabIndex={-1} className="accepted-plan-title">
            {tab === "full-plan" ? "Your complete plan" : "Your Fat-Loss Plan"}
          </h1>
          <GoalSummary summary={progress.summary} />
        </div>
        <div className="plan-page-actions">
          {tab === "full-plan" && !pendingProposal && (
            <Button
              variant="outline"
              disabled={app.journey.running}
              onClick={() => setFeedback(true)}
            >
              Give plan feedback
            </Button>
          )}
          <MeasurementAction onClick={() => checkIn()} />
        </div>
      </div>
      {pendingProposal && (
        <aside
          className="pending-plan-review"
          aria-label="Unaccepted plan alternative"
        >
          <p>
            An unaccepted plan alternative is saved. Your accepted plan is still
            active.
          </p>
          <Button asChild variant="outline">
            <a data-plan-view href="#review">
              Review plan alternative
            </a>
          </Button>
        </aside>
      )}
      <Tabs
        value={tab}
        onValueChange={(value) => navigatePlan(value)}
        className="plan-views"
      >
        <TabsList variant="line" aria-label="Accepted plan views">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="full-plan">Full plan</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" data-plan-surface="overview">
          <CheckInReview />
          {acceptedDraft && (
            <PlanFocus
              headline={acceptedDraft.content.headline}
              phases={display.phases}
              week={view.currentWeek}
              withheld={view.progress.guidanceWithheld}
              fresh={view.plan.adviceFresh}
              onOpenPlan={(fragment) => {
                navigatePlan(fragment);
                requestAnimationFrame(() =>
                  heading.current?.focus({ preventScroll: true }),
                );
              }}
            />
          )}
          <section id="progress" aria-label="Your forecast and progress">
            <ForecastPanel
              progress={progress}
              metric={metric}
              onMetricChange={setMetric}
              chartInput={chartInput}
              selectedPhase={selectedPhase?.startsOn ?? null}
              onSelectPhase={setPhaseDate}
            />
          </section>
          <section id="weekly-guidance" className="overview-week">
            <div className="section-title">
              <h2>Weekly guidance</h2>
              <span className="meta">
                {view.currentWeek
                  ? `Week of ${formatDate(view.currentWeek.weekStart)}`
                  : "No weekly suggestions saved for this date"}
              </span>
            </div>
            {view.progress.guidanceWithheld ? (
              <p className="subtle">
                Weekly guidance is paused while the current information is
                reviewed. Measurements remain available.
              </p>
            ) : view.currentWeek ? (
              <>
                {!view.plan.adviceFresh && (
                  <p className="field-hint">
                    Not yet reviewed for this update.
                  </p>
                )}
                <JourneyWeek
                  actions={view.currentWeek.actions}
                  checkIn={view.currentWeek.checkIn}
                  onCheckIn={
                    view.currentWeek.checkIn &&
                    view.currentWeek.checkIn.date <= app.today
                      ? () => checkIn(view.currentWeek!.checkIn!.date)
                      : undefined
                  }
                />
              </>
            ) : null}
          </section>
          <ForecastDetails />
        </TabsContent>
        <TabsContent value="full-plan" data-plan-surface="full-plan">
          {view.progress.guidanceWithheld ? (
            <section
              className="saved-plan-pause"
              aria-label="Saved plan guidance paused"
            >
              <Alert>
                Your accepted plan is kept. Phase and weekly guidance is paused
                for the current information. You can still add or correct
                measurements and read your saved accepted versions in Records.
              </Alert>
              <Button asChild variant="outline">
                <Link href={path("/records#accepted-plans")}>
                  View saved accepted versions
                </Link>
              </Button>
            </section>
          ) : acceptedDraft ? (
            <>
              {!view.plan.adviceFresh && (
                <p className="field-hint">
                  Saved guidance for reference · not yet reviewed against your
                  latest context.
                </p>
              )}
              <FullPlanReader
                content={acceptedDraft.content}
                target={view.target}
                display={display}
                currentWeekStart={view.currentWeek?.weekStart}
                selectedPhaseStart={
                  destination.view === "full-plan"
                    ? destination.phaseStart
                    : undefined
                }
                selectedWeekStart={
                  destination.view === "full-plan"
                    ? destination.weekStart
                    : undefined
                }
                today={app.today}
                onSelectPhase={(date) =>
                  navigatePlan(`full-plan/${date}`, { scroll: false })
                }
                onSelectWeek={(phase, week) =>
                  navigatePlan(`full-plan/${phase}/${week}`, { scroll: false })
                }
                onCheckIn={checkIn}
              />
            </>
          ) : null}
        </TabsContent>
      </Tabs>
      {feedback && <PlanRevisionForm onClose={() => setFeedback(false)} />}
    </section>
  );
}
