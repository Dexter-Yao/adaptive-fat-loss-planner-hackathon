"use client";
// ABOUTME: Whole-plan feedback starts a persisted replacement proposal through the single journey controller.
// ABOUTME: Feedback is not a measurement and cannot apply numerical changes without review/acceptance.
import { useShell } from "./app-shell";
import { JourneyFeedbackForm } from "./journey-feedback-form";
import { useAppPath, useJourneyView } from "./journey-view";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EditorPanel } from "./editor-panel";
import { navigatePlan } from "./plan-navigation";
export function PlanRevisionForm({ onClose }: { onClose: () => void }) {
  const [dirty, setDirty] = useState(false);
  const { app, view, run, error } = useJourneyView(),
    shell = useShell(),
    router = useRouter(),
    path = useAppPath();
  if (!view?.plan) return null;
  return (
    <EditorPanel
      wide
      title="Make the plan more workable"
      dirty={dirty}
      onClose={() => {
        shell.setDraftDirty(false);
        onClose();
      }}
    >
      <p>Your current plan stays active until you accept a replacement.</p>
      <JourneyFeedbackForm
        cancelLabel="Cancel feedback"
        busy={app.journey.running}
        error={error}
        minDate={app.today}
        onDirty={(value) => {
          setDirty(value);
          shell.setDraftDirty(value);
        }}
        onCancel={() => {
          shell.setDraftDirty(false);
          onClose();
        }}
        onSubmit={async (feedback) => {
          const targetDate = feedback.requestedGoalDate ?? view.plan!.endsOn;
          if (targetDate <= app.today) {
            await run(() => {
              throw new Error(
                "Choose a future goal date to review a replacement plan.",
              );
            });
            return;
          }
          const ok = await run(() =>
            app.journey.proposeRevision(
              feedback.requestedGoalDate &&
                feedback.requestedGoalDate !== view.plan!.endsOn
                ? { targetDate, mode: "loss" }
                : null,
              feedback,
            ),
          );
          if (ok) {
            setDirty(false);
            shell.setDraftDirty(false);
            onClose();
            if (window.location.pathname === path("/plan"))
              navigatePlan("review");
            else router.push(path("/plan#review"));
          }
        }}
      />
    </EditorPanel>
  );
}
