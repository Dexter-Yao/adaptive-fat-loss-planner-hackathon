"use client";
// ABOUTME: A small dated measurement editor; historical intake and activity are outside this form.
// ABOUTME: It submits only measurement fields to application commands and never writes browser storage.
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  BodyFatSchema,
  DailyObservationSchema,
  type DailyObservation,
} from "@/domain/facts";
import { useState, type FormEvent } from "react";
import { DateInput } from "./date-input";
import { EditorCancel, EditorPanel } from "./editor-panel";
import { FormField } from "./form-field";
import { ExplanationDisclosure } from "./explanation-dialog";

type Fields = Pick<DailyObservation, "date" | "weightKg" | "bodyFat" | "notes">;
const fieldSchema = DailyObservationSchema.pick({
  date: true,
  weightKg: true,
  bodyFat: true,
  notes: true,
});
export function MeasurementEditor({
  initialDate,
  observations,
  earliestDate,
  today,
  onSave,
  onClose,
  error,
}: {
  initialDate: string;
  observations: DailyObservation[];
  earliestDate: string;
  today: string;
  onSave: (measurement: Fields) => Promise<boolean>;
  onClose: () => void;
  error?: string | null;
}) {
  function initial(date: string) {
    const observation = observations.find((o) => o.date === date);
    return {
      date,
      weight: observation?.weightKg == null ? "" : String(observation.weightKg),
      fat: observation?.bodyFat ? String(observation.bodyFat.percent) : "",
      method: observation?.bodyFat?.method ?? "bia",
      notes: observation?.notes ?? "",
    };
  }
  const [form, setForm] = useState(() => initial(initialDate));
  const [nextDate, setNextDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState("");
  const dirty = JSON.stringify(form) !== JSON.stringify(initial(form.date));
  function changeDate(date: string) {
    if (date === form.date) return;
    if (dirty && /^\d{4}-\d{2}-\d{2}$/.test(date)) setNextDate(date);
    else setForm(initial(date));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setValidation("");
    const parsed = fieldSchema.safeParse({
      date: form.date,
      weightKg: form.weight === "" ? null : Number(form.weight),
      bodyFat:
        form.fat === ""
          ? null
          : { percent: Number(form.fat), method: form.method },
      notes: form.notes.trim(),
    });
    if (!parsed.success) {
      setValidation(parsed.error.issues[0].message);
      return;
    }
    if (!parsed.data.weightKg && !parsed.data.bodyFat && !parsed.data.notes) {
      setValidation("Add a measurement or a short note for this check-in.");
      return;
    }
    setSaving(true);
    try {
      if (await onSave(parsed.data)) onClose();
    } catch (reason) {
      setValidation(
        reason instanceof Error
          ? reason.message
          : "This update could not be saved. Your entries are still here.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <EditorPanel title="Update your progress" onClose={onClose} dirty={dirty}>
        <div className="section-title">
          <p className="field-hint">Add a measurement, a note, or both.</p>
          <ExplanationDisclosure title="About measurement updates">
            <p>
              Measurements refresh the forecast. A note alone adds context
              without creating a measurement.
            </p>
            <p>
              The coach reviews eligible changes. A proposed plan change still
              needs your acceptance.
            </p>
          </ExplanationDisclosure>
        </div>
        <form
          className="editor-form"
          onSubmit={save}
          aria-label="Progress update"
        >
          <FormField>
            Measurement date
            <DateInput
              required
              min={earliestDate}
              max={today}
              value={form.date}
              onValue={changeDate}
            />
          </FormField>
          <div className="form-grid">
            <FormField>
              Weight · kg · optional
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={
                  DailyObservationSchema.shape.weightKg.unwrap().minValue ??
                  undefined
                }
                max={
                  DailyObservationSchema.shape.weightKg.unwrap().maxValue ??
                  undefined
                }
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: e.target.value })}
                placeholder="e.g. 76.2"
              />
            </FormField>
            <FormField>
              Body fat · % · optional
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={BodyFatSchema.shape.percent.minValue ?? undefined}
                max={BodyFatSchema.shape.percent.maxValue ?? undefined}
                value={form.fat}
                onChange={(e) => setForm({ ...form, fat: e.target.value })}
                placeholder="e.g. 24.7"
              />
            </FormField>
          </div>
          {form.fat !== "" && (
            <FormField>
              Body-fat measurement method
              <NativeSelect
                value={form.method}
                onChange={(e) =>
                  setForm({
                    ...form,
                    method: e.target.value as typeof form.method,
                  })
                }
              >
                <NativeSelectOption value="bia">
                  Body-fat scale / BIA
                </NativeSelectOption>
                <NativeSelectOption value="dxa">DXA scan</NativeSelectOption>
                <NativeSelectOption value="caliper">
                  Skinfold caliper
                </NativeSelectOption>
                <NativeSelectOption value="other">
                  Other method
                </NativeSelectOption>
              </NativeSelect>
            </FormField>
          )}
          <FormField>
            A note about your week · optional
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              maxLength={
                DailyObservationSchema.shape.notes.maxLength ?? undefined
              }
              rows={4}
              placeholder="Travel, a change in routine, or anything you want to remember."
            />
          </FormField>
          {(validation || error) && (
            <p role="alert" className="inline-error">
              {validation || error}
            </p>
          )}
          <div className="editor-footer">
            <EditorCancel>Cancel</EditorCancel>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner aria-hidden />}
              {saving ? "Saving update…" : "Save update"}
            </Button>
          </div>
        </form>
      </EditorPanel>
      <AlertDialog
        open={nextDate !== null}
        onOpenChange={(open) => {
          if (!open) setNextDate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change the date?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved entries will be discarded and the saved check-in for
              the selected date will open.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (nextDate) setForm(initial(nextDate));
                setNextDate(null);
                setValidation("");
              }}
            >
              Change date
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
