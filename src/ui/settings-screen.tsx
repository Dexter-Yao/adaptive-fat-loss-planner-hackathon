"use client";
// ABOUTME: Secondary practical preferences; existing numerical and diary facts remain under application ownership.
import { useApplication } from "@/application/provider";
import { formatDate, goalLabel } from "@/application/selectors";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { PlanningPreferencesSchema } from "@/domain/facts";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useShell } from "./app-shell";
import { usePreview } from "./experience-host";
import { FormField } from "./form-field";
import { useAppPath } from "./journey-view";
import { Disclosure } from "./task-components";
import { ExplanationDialog } from "./explanation-dialog";
export function SettingsScreen() {
  const app = useApplication();
  return app.session ? <SettingsForm key={app.session.id} /> : null;
}
function SettingsForm() {
  const app = useApplication(),
    s = app.session!,
    shell = useShell(),
    router = useRouter(),
    path = useAppPath(),
    preview = usePreview();
  const [form, setForm] = useState({
      food: s.preferences.foodPreferences,
      context: s.preferences.context,
      cooking: s.preferences.cooking,
      capacity: String(s.preferences.availableTrainingMinutes),
    }),
    [error, setError] = useState("");
  const dirty =
    form.food !== s.preferences.foodPreferences ||
    form.context !== s.preferences.context ||
    form.cooking !== s.preferences.cooking ||
    Number(form.capacity) !== s.preferences.availableTrainingMinutes;
  useEffect(() => {
    shell.setDraftDirty(dirty);
    return () => shell.setDraftDirty(false);
  }, [dirty, shell.setDraftDirty]);
  function save(e: FormEvent) {
    e.preventDefault();
    const parsed = PlanningPreferencesSchema.safeParse({
      ...s.preferences,
      foodPreferences: form.food,
      context: form.context,
      cooking: form.cooking,
      availableTrainingMinutes: Number(form.capacity),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError("");
    app.savePreferences(parsed.data);
  }
  return (
    <div className="settings-layout">
      <div className="page-title">
        <div>
          <h1>Your preferences</h1>
        </div>
        <ExplanationDialog
          title="About preference changes"
          description="Saving your preferences"
        >
          <p>
            Saving updates your context. It does not accept a new plan or change
            your calorie target.
          </p>
        </ExplanationDialog>
      </div>
      <form className="editor-form" onSubmit={save}>
        <Card>
          <CardContent className="editor-form">
            <FormField>
              Food preferences and restrictions
              <Textarea
                value={form.food}
                maxLength={
                  PlanningPreferencesSchema.shape.foodPreferences.maxLength ??
                  undefined
                }
                onChange={(e) => setForm({ ...form, food: e.target.value })}
              />
            </FormField>
            <FormField>
              Meals most days
              <NativeSelect
                value={form.cooking}
                onChange={(e) =>
                  setForm({
                    ...form,
                    cooking: e.target.value as typeof form.cooking,
                  })
                }
              >
                <NativeSelectOption value="mostly_out">
                  Mostly bought meals
                </NativeSelectOption>
                <NativeSelectOption value="mixed">
                  A mix of home and bought meals
                </NativeSelectOption>
                <NativeSelectOption value="mostly_home">
                  Mostly home cooked
                </NativeSelectOption>
              </NativeSelect>
            </FormField>
            <FormField>
              Time available for planned activity each week (minutes)
              <Input
                type="number"
                required
                min={0}
                max={
                  PlanningPreferencesSchema.shape.availableTrainingMinutes.unwrap()
                    .maxValue ?? undefined
                }
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
            </FormField>
            <FormField>
              Other circumstances or obstacles
              <Textarea
                value={form.context}
                maxLength={
                  PlanningPreferencesSchema.shape.context.maxLength ?? undefined
                }
                onChange={(e) => setForm({ ...form, context: e.target.value })}
              />
            </FormField>
            {(error || app.error) && (
              <p role="alert" className="inline-error">
                {error || app.error}
              </p>
            )}
            <Button disabled={!dirty || app.journey.running}>
              Save preferences
            </Button>
          </CardContent>
        </Card>
      </form>
      <Disclosure title="Your starting point">
        <p>
          {s.profile.ageYears} years · {s.profile.sex} · {s.profile.heightCm} cm
          · {s.profile.weightKg} kg
        </p>
        <p>
          Measured {formatDate(s.profile.startDate)}. Goal: {goalLabel(s)}.
        </p>
        <p>
          New measurements belong in Update. Keeping the original baseline makes
          changes traceable.
        </p>
      </Disclosure>
      <Disclosure title="Local data and privacy">
        <p>
          {preview
            ? "This fictional example is saved separately. Its scripted coaching does not call an AI provider."
            : "Your plan is saved in this browser. Clearing browser data removes it. AI requests send the relevant plan context to the configured model service."}
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline">Clear all local data</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all local data?</AlertDialogTitle>
              <AlertDialogDescription>
                {preview
                  ? "This removes only the fictional example. Your personal plan is not affected."
                  : "This permanently removes the current plan, measurements, any new-plan draft and all previous plan history from this browser. Replanning keeps that history."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep my plan</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  if (app.reset()) {
                    shell.setDraftDirty(false);
                    router.replace(path("/"));
                  }
                }}
              >
                Clear all local data
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Disclosure>
    </div>
  );
}
