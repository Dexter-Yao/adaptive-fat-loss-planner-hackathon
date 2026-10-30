"use client";
// ABOUTME: Minimal first-step screening control; policy and clinical-scope copy derive from the domain owner.
// ABOUTME: This unsaved selection is not medical clearance and does not create a separate health record.
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  ELIGIBILITY_BOUNDARY_NOTE,
  ELIGIBILITY_DETAILS,
  ELIGIBILITY_OPTIONS,
  ELIGIBILITY_QUESTION,
  ELIGIBILITY_SUMMARY,
} from "@/domain/planning-eligibility";
import { FormField } from "./form-field";
import { Disclosure } from "./task-components";
export function EligibilityQuestion({
  value,
  onChange,
  message,
}: {
  value: string;
  onChange: (value: string) => void;
  message: string | null;
}) {
  return (
    <section aria-label="Planning suitability">
      <p className="field-hint">{ELIGIBILITY_SUMMARY}</p>
      <FormField>
        {ELIGIBILITY_QUESTION}
        <NativeSelect
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <NativeSelectOption value="" disabled>
            Select an answer
          </NativeSelectOption>
          {ELIGIBILITY_OPTIONS.map((o) => (
            <NativeSelectOption key={o.value} value={o.value}>
              {o.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </FormField>
      <Disclosure title="Which health situations are outside this prototype?">
        <p>{ELIGIBILITY_DETAILS}</p>
        <p>{ELIGIBILITY_BOUNDARY_NOTE}</p>
      </Disclosure>
      {message && (
        <Alert role="alert">
          <AlertTitle>A different kind of support is needed</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
