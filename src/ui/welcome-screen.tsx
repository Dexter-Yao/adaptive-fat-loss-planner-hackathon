"use client";
// ABOUTME: First-use introduction with an explicit separate example entry.
// ABOUTME: Navigation is supplied by the route; this page cannot create or replace a personal session.
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, CalendarDays, Scale, TrendingUp } from "lucide-react";

export function WelcomeScreen({
  hasSession,
  onStart,
  onExample,
}: {
  hasSession: boolean;
  onStart: () => void;
  onExample: () => void;
}) {
  return (
    <div className="welcome-layout">
      <section className="welcome-intro">
        <h1>
          Adaptive
          <br />
          <span>Fat Loss Planner</span>
        </h1>
        <p className="welcome-slogan">
          A personalized plan that adapts to your progress and everyday life.
        </p>
        <p className="welcome-description">
          Review a complete plan built from your details and calculated
          forecasts. Update your measurements as you go.
        </p>
        <div className="welcome-actions">
          <Button size="lg" onClick={onStart}>
            {hasSession ? "Return to my plan" : "Build my plan"}
            <ArrowRight aria-hidden />
          </Button>
          <Button size="lg" variant="outline" onClick={onExample}>
            Explore an example
          </Button>
        </div>
        <p className="field-hint">
          {hasSession
            ? "Your saved plan stays separate from the example."
            : "No account needed."}
        </p>
      </section>
      <Card className="welcome-preview">
        <CardContent className="welcome-steps">
          <div className="welcome-step">
            <span className="step-icon">
              <CalendarDays aria-hidden />
            </span>
            <div>
              <h2>Build your plan</h2>
              <p>
                Your goal and routine inform a complete, calculator-checked
                proposal.
              </p>
            </div>
          </div>
          <div className="welcome-step">
            <span className="step-icon">
              <Scale aria-hidden />
            </span>
            <div>
              <h2>Update your measurements</h2>
              <p>Save weight, body fat or a note about your week.</p>
            </div>
          </div>
          <div className="welcome-step">
            <span className="step-icon">
              <TrendingUp aria-hidden />
            </span>
            <div>
              <h2>Review adjustments</h2>
              <p>
                See updated forecasts and decide whether to change your plan.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
