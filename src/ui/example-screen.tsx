"use client";
// ABOUTME: Explicit fictional journey entry and fault controls, separated from personal routes and storage.
import type { PreviewFault } from "@/application/preview-runtime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { fictionalInput } from "@/fixtures/journey";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DateInput } from "./date-input";
import { usePreview } from "./experience-host";
import { FormField } from "./form-field";
import { useJourneyView } from "./journey-view";
import { Disclosure } from "./task-components";
export function ExampleScreen() {
  const { app, run, error } = useJourneyView(),
    router = useRouter();
  return (
    <Card className="example-intro">
      <CardHeader>
        <CardTitle>A fictional plan, safe to explore</CardTitle>
      </CardHeader>
      <CardContent>
        <p>
          34 years · female · 165 cm · 72 kg → 68 kg. Explore setup, plan review
          and measurement updates.
        </p>
        <div className="flex flex-wrap gap-3">
          {app.session ? (
            <Button asChild>
              <Link href="/example/plan">Continue example</Link>
            </Button>
          ) : (
            <Button
              onClick={() => {
                void run(() => app.journey.start(fictionalInput(), true));
                router.push("/example/plan");
              }}
            >
              Build the sample plan
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href="/example/start">Try the setup flow</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/start">Use my own details</Link>
          </Button>
        </div>
        {error && <p role="alert">{error}</p>}
      </CardContent>
    </Card>
  );
}
export function PreviewControls() {
  const preview = usePreview(),
    [fault, setFault] = useState<PreviewFault>(
      () => preview?.runtime.fault ?? "none",
    ),
    { app } = useJourneyView();
  if (!preview) return null;
  return (
    <Disclosure className="preview-controls" title="Fictional preview controls">
      <p className="field-hint">
        These controls test interaction and recovery only. No actual AI is
        called.
      </p>
      <div className="form-grid">
        <FormField>
          Preview day
          <DateInput
            min="2026-06-01"
            max="2026-08-01"
            value={preview.runtime.date}
            onValue={(value) => {
              if (value) {
                preview.runtime.date = value;
                preview.refreshClock();
              }
            }}
          />
        </FormField>
        <FormField>
          Simulated condition
          <NativeSelect
            value={fault}
            onChange={(e) => {
              const value = e.target.value as PreviewFault;
              setFault(value);
              preview.runtime.fault = value;
            }}
          >
            <NativeSelectOption value="none">Normal</NativeSelectOption>
            <NativeSelectOption value="model_unavailable">
              AI unavailable
            </NativeSelectOption>
            <NativeSelectOption value="slow_model">
              Slow response
            </NativeSelectOption>
            <NativeSelectOption value="storage_unavailable">
              Cannot save
            </NativeSelectOption>
            <NativeSelectOption value="suggest_revision">
              Coach suggests a revision
            </NativeSelectOption>
          </NativeSelect>
        </FormField>
      </div>
      <p className="field-hint">
        {app.session
          ? "Preview state is saved separately in this browser."
          : "Start or continue the example to explore these conditions."}
      </p>
    </Disclosure>
  );
}
