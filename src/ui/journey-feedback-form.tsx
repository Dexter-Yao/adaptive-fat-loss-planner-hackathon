"use client";
// ABOUTME: Structured feedback entry for an existing journey proposal.
// ABOUTME: The application supplies revision eligibility and binds feedback to its exact draft; this form only holds unsaved fields.
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { JourneyFeedbackSchema, type JourneyFeedback } from "@/domain/journey";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { DateInput } from "./date-input";
import { FormField } from "./form-field";
import { feedbackPriorities } from "./labels";

type FeedbackFields = Pick<
  JourneyFeedback,
  "priorities" | "availableTrainingMinutes" | "requestedGoalDate" | "notes"
>;
export function JourneyFeedbackForm({
  onSubmit,
  onCancel,
  onDirty,
  busy,
  minDate,
  maxDate,
  error,
  submitLabel = "Revise my plan",
  cancelLabel = "Keep this draft",
}: {
  onSubmit: (feedback: FeedbackFields) => void;
  onCancel: () => void;
  onDirty: (dirty: boolean) => void;
  busy: boolean;
  minDate: string;
  maxDate?: string;
  error?: string | null;
  submitLabel?: string;
  cancelLabel?: string;
}) {
  const heading = useRef<HTMLLegendElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const [priorities, setPriorities] = useState<FeedbackFields["priorities"]>(
    [],
  );
  const [minutes, setMinutes] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [validation, setValidation] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!priorities.length) {
      setValidation("Choose at least one thing you would like to change.");
      return;
    }
    setValidation("");
    onSubmit({
      priorities,
      availableTrainingMinutes: minutes === "" ? null : Number(minutes),
      requestedGoalDate: date || null,
      notes,
    });
  }
  return (
    <form
      onSubmit={submit}
      className="editor-form"
      onChange={() => onDirty(true)}
    >
      <fieldset disabled={busy}>
        <legend ref={heading} tabIndex={-1}>
          What would make this more workable?
        </legend>
        <div className="feedback-options">
          {feedbackPriorities.map(([id, label]) => (
            <FormField key={id} className="feedback-option">
              <Checkbox
                checked={priorities.includes(id)}
                onCheckedChange={(checked) => {
                  onDirty(true);
                  setPriorities((p) =>
                    checked === true ? [...p, id] : p.filter((v) => v !== id),
                  );
                }}
              />
              {label}
            </FormField>
          ))}
        </div>
      </fieldset>
      {priorities.includes("less_time") && (
        <FormField>
          Available activity time · minutes/week
          <Input
            disabled={busy}
            type="number"
            min={
              JourneyFeedbackSchema.shape.availableTrainingMinutes.unwrap()
                .minValue ?? undefined
            }
            max={
              JourneyFeedbackSchema.shape.availableTrainingMinutes.unwrap()
                .maxValue ?? undefined
            }
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="Optional"
          />
        </FormField>
      )}
      {priorities.includes("later_goal_date") && (
        <FormField>
          Preferred goal date · optional
          <DateInput
            disabled={busy}
            value={date}
            min={minDate}
            max={maxDate}
            onValue={setDate}
          />
        </FormField>
      )}
      <FormField>
        Anything else? · optional
        <Textarea
          disabled={busy}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={JourneyFeedbackSchema.shape.notes.maxLength ?? undefined}
          rows={4}
          placeholder="For example, I buy lunch at work and cannot prepare food there."
        />
      </FormField>
      {(validation || error) && (
        <p className="inline-error" role="alert">
          {validation || error}
        </p>
      )}
      <div className="editor-footer">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onCancel}
        >
          {cancelLabel}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <Spinner aria-hidden />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
