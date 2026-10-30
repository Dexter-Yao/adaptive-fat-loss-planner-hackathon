"use client";
// ABOUTME: Focused initial fact collection; the caller owns interpretation, calculation and persistence.
// ABOUTME: This form holds unsaved fields only and submits the shared initialization contract.
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  BodyFatSchema,
  PlanningPreferencesSchema,
  ProfileFactsSchema,
  RoutineSchema,
  defaultPreferences,
  type ProfileFacts,
} from "@/domain/facts";
import {
  InitializationInputSchema,
  type InitializationInput,
} from "@/domain/initialization";
import { EXERCISES, LEISURE_LABELS, WORK_LABELS } from "@/planning/activity";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { DateInput } from "./date-input";
import { FormField } from "./form-field";
import { Disclosure } from "./task-components";
import { EligibilityQuestion } from "./eligibility-question";
import { assessPlanningEligibility } from "@/domain/planning-eligibility";
import { ExplanationDialog } from "./explanation-dialog";

const STEPS = [
  "Your starting point",
  "Your goal",
  "Your current activity",
  "Make room for real life",
  "Check your details",
];
export function SetupForm({
  today,
  timezone,
  initial,
  onSubmit,
  onDirty,
  busy,
  error,
}: {
  today: string;
  timezone: string;
  initial?: InitializationInput;
  onSubmit: (input: InitializationInput) => void;
  onDirty: (dirty: boolean) => void;
  busy: boolean;
  error?: string | null;
}) {
  const [step, setStep] = useState(0),
    heading = useRef<HTMLHeadingElement>(null);
  const [validation, setValidation] = useState("");
  const [form, setForm] = useState({
    age: initial ? String(initial.profile.ageYears) : "",
    sex: initial?.profile.sex ?? "",
    height: initial ? String(initial.profile.heightCm) : "",
    weight: initial ? String(initial.profile.weightKg) : "",
    date: initial?.profile.startDate ?? today,
    fat: initial?.profile.bodyFat
      ? String(initial.profile.bodyFat.percent)
      : "",
    fatMethod: initial?.profile.bodyFat?.method ?? "bia",
    goalKind: initial?.goal.kind ?? "weight",
    goal: initial ? String(initial.goal.value) : "",
    deadline: initial?.goal.requestedDate ?? "",
    work: initial?.profile.activity.work ?? "",
    leisure: initial?.profile.activity.leisure ?? "",
    capacity: initial
      ? String(initial.preferences.availableTrainingMinutes)
      : "",
    cooking: initial?.preferences.cooking ?? "mostly_out",
    food: initial?.preferences.foodPreferences ?? "",
    context: initial?.preferences.context ?? "",
    eligibility: initial?.profile.eligibility ?? "",
  });
  const [routines, setRoutines] = useState<
    { kind: string; minutes: string; timesPerWeek: string }[]
  >(
    initial?.profile.activity.routines.map((r) => ({
      kind: r.kind,
      minutes: String(r.minutes),
      timesPerWeek: String(r.timesPerWeek),
    })) ?? [],
  );
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);
  function change(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setValidation("");
    onDirty(true);
  }
  function values(): InitializationInput {
    return InitializationInputSchema.parse({
      profile: {
        ageYears: Number(form.age),
        sex: form.sex,
        heightCm: Number(form.height),
        weightKg: Number(form.weight),
        startDate: form.date,
        bodyFat: form.fat
          ? { percent: Number(form.fat), method: form.fatMethod }
          : null,
        timezone,
        eligibility: form.eligibility,
        activity: {
          work: form.work,
          leisure: form.leisure,
          routines: routines.map((r) => ({
            kind: r.kind,
            minutes: Number(r.minutes),
            timesPerWeek: Number(r.timesPerWeek),
          })),
          source: "questionnaire",
          migratedPal: null,
        },
      },
      goal: {
        id: initial?.goal.id ?? "initial-goal",
        kind: form.goalKind,
        value: Number(form.goal),
        requestedDate: form.deadline || null,
      },
      preferences: {
        ...(initial?.preferences ?? defaultPreferences(form.date)),
        foodPreferences: form.food,
        context: form.context,
        cooking: form.cooking,
        availableTrainingMinutes: Number(form.capacity),
      },
    });
  }
  function next(event: FormEvent) {
    event.preventDefault();
    setValidation("");
    if (step === 0 && (!form.eligibility || suitability?.supported === false)) {
      setValidation(
        suitability?.message ??
          "Choose a suitability answer before continuing.",
      );
      return;
    }
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    try {
      const input = values();
      if (step === 3) setStep(4);
      else onSubmit(input);
    } catch (reason) {
      setValidation(
        reason instanceof Error && "issues" in reason
          ? (reason as { issues: { message: string }[] }).issues[0].message
          : "Check your details before continuing.",
      );
    }
  }
  const bodyLimits = ProfileFactsSchema.shape;
  const suitability = assessPlanningEligibility({
    ageYears:
      form.age.trim() && Number.isFinite(Number(form.age))
        ? Number(form.age)
        : null,
    eligibility: (form.eligibility ||
      "standard") as ProfileFacts["eligibility"],
  });
  return (
    <Card className="setup">
      <CardHeader>
        <div className="setup-step-label">
          <p className="meta">
            Step {step + 1} of {STEPS.length}
          </p>
          <ExplanationDialog
            title="How your details are used"
            description={STEPS[step]}
          >
            <p>
              {
                [
                  "Measurements give the forecast its starting point. Unknown body fat is estimated, not measured.",
                  "Without a deadline, the calculator estimates a timeline. Any goal or date trade-off is shown before acceptance.",
                  "Report your actual recent activity separately from future available time. Future capacity does not count as exercise already done.",
                  "Your preferences and obstacles help the coach make the plan workable.",
                  "The coach interprets your routine, code calculates the forecast, and the coach proposes a complete plan for you to review.",
                ][step]
              }
            </p>
          </ExplanationDialog>
        </div>
        <Progress
          value={((step + 1) / STEPS.length) * 100}
          aria-label={`Setup step ${step + 1} of ${STEPS.length}`}
          className="setup-progress"
        />
        <h1 ref={heading} tabIndex={-1}>
          {STEPS[step]}
        </h1>
      </CardHeader>
      <CardContent>
        <form className="editor-form" onSubmit={next}>
          {step === 0 && (
            <>
              <EligibilityQuestion
                value={form.eligibility}
                onChange={(v) => change("eligibility", v)}
                message={suitability?.message ?? null}
              />
              <div className="form-grid">
                <FormField>
                  Age
                  <Input
                    required
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={120}
                    value={form.age}
                    onChange={(e) => change("age", e.target.value)}
                  />
                </FormField>
                <FormField>
                  Sex used by the models
                  <NativeSelect
                    required
                    value={form.sex}
                    onChange={(e) => change("sex", e.target.value)}
                  >
                    <NativeSelectOption value="" disabled>
                      Select
                    </NativeSelectOption>
                    <NativeSelectOption value="female">
                      Female
                    </NativeSelectOption>
                    <NativeSelectOption value="male">Male</NativeSelectOption>
                  </NativeSelect>
                </FormField>
                <FormField>
                  Height · cm
                  <Input
                    required
                    type="number"
                    inputMode="decimal"
                    min={bodyLimits.heightCm.minValue ?? undefined}
                    max={bodyLimits.heightCm.maxValue ?? undefined}
                    value={form.height}
                    onChange={(e) => change("height", e.target.value)}
                  />
                </FormField>
                <FormField>
                  Starting weight · kg
                  <Input
                    required
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={bodyLimits.weightKg.minValue ?? undefined}
                    max={bodyLimits.weightKg.maxValue ?? undefined}
                    value={form.weight}
                    onChange={(e) => change("weight", e.target.value)}
                  />
                </FormField>
              </div>
              <FormField>
                Measurement date
                <DateInput
                  required
                  value={form.date}
                  max={today}
                  onValue={(value) => change("date", value)}
                />
              </FormField>
              <Disclosure title="Add a known body-fat measurement · optional">
                <div className="form-grid">
                  <FormField>
                    Body fat · %
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      value={form.fat}
                      min={BodyFatSchema.shape.percent.minValue ?? undefined}
                      max={BodyFatSchema.shape.percent.maxValue ?? undefined}
                      onChange={(e) => change("fat", e.target.value)}
                    />
                  </FormField>
                  <FormField>
                    Measurement method
                    <NativeSelect
                      value={form.fatMethod}
                      onChange={(e) => change("fatMethod", e.target.value)}
                    >
                      <NativeSelectOption value="bia">
                        Body-fat scale / BIA
                      </NativeSelectOption>
                      <NativeSelectOption value="dxa">
                        DXA scan
                      </NativeSelectOption>
                      <NativeSelectOption value="caliper">
                        Skinfold caliper
                      </NativeSelectOption>
                      <NativeSelectOption value="other">
                        Other method
                      </NativeSelectOption>
                    </NativeSelect>
                  </FormField>
                </div>
                <p>
                  Without a measurement, the forecast uses a clearly labeled
                  estimate. Fat-free mass is not the same as muscle mass.
                </p>
              </Disclosure>
            </>
          )}
          {step === 1 && (
            <>
              <FormField>
                I want to reach
                <NativeSelect
                  value={form.goalKind}
                  onChange={(e) => change("goalKind", e.target.value)}
                >
                  <NativeSelectOption value="weight">
                    A target weight
                  </NativeSelectOption>
                  <NativeSelectOption value="body_fat">
                    A body-fat percentage
                  </NativeSelectOption>
                </NativeSelect>
              </FormField>
              <FormField>
                {form.goalKind === "weight"
                  ? "Target weight · kg"
                  : "Target body fat · %"}
                <Input
                  required
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={form.goal}
                  onChange={(e) => change("goal", e.target.value)}
                />
              </FormField>
              <FormField>
                Preferred goal date · optional
                <DateInput
                  value={form.deadline}
                  min={today}
                  onValue={(value) => change("deadline", value)}
                />
              </FormField>
            </>
          )}
          {step === 2 && (
            <>
              <FormField>
                Most days, outside dedicated exercise
                <NativeSelect
                  required
                  value={form.work}
                  onChange={(e) => change("work", e.target.value)}
                >
                  <NativeSelectOption value="" disabled>
                    Choose your daily routine
                  </NativeSelectOption>
                  {Object.entries(WORK_LABELS).map(([id, label]) => (
                    <NativeSelectOption key={id} value={id}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField>
                My actual activity in the past two weeks
                <NativeSelect
                  required
                  value={form.leisure}
                  onChange={(e) => change("leisure", e.target.value)}
                >
                  <NativeSelectOption value="" disabled>
                    Choose your recent activity
                  </NativeSelectOption>
                  {Object.entries(LEISURE_LABELS).map(([id, label]) => (
                    <NativeSelectOption key={id} value={id}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
              <Disclosure
                title="Regular exercise · optional"
                defaultOpen={routines.length > 0}
              >
                {routines.map((r, i) => (
                  <div className="routine-entry" key={i}>
                    <FormField>
                      Activity {i + 1}
                      <NativeSelect
                        value={r.kind}
                        onChange={(e) => {
                          onDirty(true);
                          setRoutines((rows) =>
                            rows.map((row, j) =>
                              j === i ? { ...row, kind: e.target.value } : row,
                            ),
                          );
                        }}
                      >
                        {Object.entries(EXERCISES).map(([id, v]) => (
                          <NativeSelectOption value={id} key={id}>
                            {v.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </FormField>
                    <div className="form-grid">
                      <FormField>
                        Times per week
                        <Input
                          required
                          type="number"
                          min={
                            RoutineSchema.shape.timesPerWeek.minValue ??
                            undefined
                          }
                          max={
                            RoutineSchema.shape.timesPerWeek.maxValue ??
                            undefined
                          }
                          step="0.5"
                          value={r.timesPerWeek}
                          onChange={(e) => {
                            onDirty(true);
                            setRoutines((rows) =>
                              rows.map((row, j) =>
                                j === i
                                  ? { ...row, timesPerWeek: e.target.value }
                                  : row,
                              ),
                            );
                          }}
                        />
                      </FormField>
                      <FormField>
                        Minutes each time
                        <Input
                          required
                          type="number"
                          min={
                            RoutineSchema.shape.minutes.minValue ?? undefined
                          }
                          max={
                            RoutineSchema.shape.minutes.maxValue ?? undefined
                          }
                          value={r.minutes}
                          onChange={(e) => {
                            onDirty(true);
                            setRoutines((rows) =>
                              rows.map((row, j) =>
                                j === i
                                  ? { ...row, minutes: e.target.value }
                                  : row,
                              ),
                            );
                          }}
                        />
                      </FormField>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        onDirty(true);
                        setRoutines((rows) => rows.filter((_, j) => j !== i));
                      }}
                    >
                      Remove activity {i + 1}
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onDirty(true);
                    setRoutines((rows) => [
                      ...rows,
                      { kind: "walking", minutes: "30", timesPerWeek: "1" },
                    ]);
                  }}
                >
                  Add regular activity
                </Button>
              </Disclosure>
              <FormField>
                Time you can give to activity going forward · minutes/week
                <Input
                  required
                  type="number"
                  min={
                    PlanningPreferencesSchema.shape.availableTrainingMinutes.unwrap()
                      .minValue ?? undefined
                  }
                  max={
                    PlanningPreferencesSchema.shape.availableTrainingMinutes.unwrap()
                      .maxValue ?? undefined
                  }
                  value={form.capacity}
                  onChange={(e) => change("capacity", e.target.value)}
                  placeholder="Zero is okay"
                />
              </FormField>
            </>
          )}
          {step === 3 && (
            <>
              <FormField>
                Most of my meals are
                <NativeSelect
                  value={form.cooking}
                  onChange={(e) => change("cooking", e.target.value)}
                >
                  <NativeSelectOption value="mostly_out">
                    Bought or eaten out
                  </NativeSelectOption>
                  <NativeSelectOption value="mixed">
                    A mix of bought and home-cooked
                  </NativeSelectOption>
                  <NativeSelectOption value="mostly_home">
                    Prepared at home
                  </NativeSelectOption>
                </NativeSelect>
              </FormField>
              <FormField>
                Food preferences and restrictions · optional
                <Textarea
                  rows={3}
                  value={form.food}
                  onChange={(e) => change("food", e.target.value)}
                  placeholder="Foods you avoid, allergies, or meals you want to keep."
                />
              </FormField>
              <FormField>
                What could make this difficult? · optional
                <Textarea
                  rows={3}
                  value={form.context}
                  onChange={(e) => change("context", e.target.value)}
                  placeholder="For example, frequent travel, no kitchen at work, or a very irregular schedule."
                />
              </FormField>
            </>
          )}
          {step === 4 && (
            <div className="setup-review">
              <dl>
                <div>
                  <dt>Starting point</dt>
                  <dd>
                    {form.weight} kg · {form.height} cm · {form.age} years ·{" "}
                    {form.sex}
                  </dd>
                </div>
                <div>
                  <dt>Goal</dt>
                  <dd>
                    {form.goal}{" "}
                    {form.goalKind === "weight" ? "kg" : "% body fat"}
                    {form.deadline
                      ? ` by ${form.deadline}`
                      : " · timeline to be calculated"}
                  </dd>
                </div>
                <div>
                  <dt>Current activity</dt>
                  <dd>
                    {WORK_LABELS[form.work as ProfileFacts["activity"]["work"]]}
                    <br />
                    {
                      LEISURE_LABELS[
                        form.leisure as ProfileFacts["activity"]["leisure"]
                      ]
                    }
                  </dd>
                </div>
                <div>
                  <dt>Time available for future activity</dt>
                  <dd>{form.capacity} minutes/week</dd>
                </div>
                <div>
                  <dt>Body fat</dt>
                  <dd>
                    {form.fat
                      ? `${form.fat}% · ${form.fatMethod}`
                      : "Not measured · a labeled estimate will be used"}
                  </dd>
                </div>
              </dl>
              {(form.food || form.context) && (
                <Disclosure title="Preferences and circumstances">
                  {form.food && (
                    <p>
                      <strong>Your preferences</strong>
                      <br />
                      {form.food}
                    </p>
                  )}
                  {form.context && (
                    <p>
                      <strong>Your everyday life</strong>
                      <br />
                      {form.context}
                    </p>
                  )}
                </Disclosure>
              )}
            </div>
          )}
          {(validation || error) && (
            <p role="alert" className="inline-error">
              {validation || error}
            </p>
          )}
          <div className="editor-footer">
            {step > 0 && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setStep(step - 1);
                  setValidation("");
                }}
              >
                <ArrowLeft aria-hidden />
                Back
              </Button>
            )}
            <Button
              type="submit"
              disabled={
                busy || (step === 0 && suitability?.supported === false)
              }
            >
              {busy
                ? "Preparing your plan…"
                : step === 4
                  ? "Generate my plan"
                  : "Continue"}
              {!busy && <ArrowRight aria-hidden />}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
