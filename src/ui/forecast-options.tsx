"use client";
// ABOUTME: Secondary chart layers are explicit display choices, using shared shadcn controls.
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SlidersHorizontal } from "lucide-react";
import { DAILY_VARIATION_POLICY } from "@/application/daily-variation";
export function ForecastOptions({
  weight,
  showVariation,
  onVariation,
  referenceAvailable,
  showReference,
  onReference,
  canRange,
  showRange,
  onRange,
}: {
  weight: boolean;
  showVariation: boolean;
  onVariation: (show: boolean) => void;
  referenceAvailable: boolean;
  showReference: boolean;
  onReference: (show: boolean) => void;
  canRange: boolean;
  showRange: boolean;
  onRange: (show: boolean) => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Chart display options"
          title="Display options"
        >
          <SlidersHorizontal />
        </Button>
      </DialogTrigger>
      <DialogContent className="forecast-help">
        <DialogHeader>
          <DialogTitle>Chart display</DialogTitle>
          <DialogDescription>
            Choose supporting layers. Your calculated trend and saved
            measurements stay unchanged.
          </DialogDescription>
        </DialogHeader>
        {weight && (
          <label className="forecast-option">
            <Checkbox
              checked={showVariation}
              onCheckedChange={(v) => onVariation(v === true)}
            />
            <span>
              <strong>Daily fluctuation illustration</strong>
              <small>
                Show a lighter morning/evening example around the trend.
                Illustrative half-range:{" "}
                {(DAILY_VARIATION_POLICY.minimumHalfRange * 100).toFixed(1)}–
                {(DAILY_VARIATION_POLICY.maximumHalfRange * 100).toFixed(1)}% of
                weight. This is a display assumption, not a personal prediction
                or a confidence interval.
              </small>
            </span>
          </label>
        )}
        <label className="forecast-option">
          <Checkbox
            disabled={!referenceAvailable}
            checked={showReference}
            onCheckedChange={(v) => onReference(v === true)}
          />
          <span>
            <strong>Accepted Hall reference</strong>
            <small>
              The unchanged forecast saved when you accepted the plan.
              {!referenceAvailable && " Not available for this view."}
            </small>
          </span>
        </label>
        {canRange && (
          <label className="forecast-option">
            <Checkbox
              checked={showRange}
              onCheckedChange={(v) => onRange(v === true)}
            />
            <span>
              <strong>Input-assumption range</strong>
              <small>
                The selected model's missing-input sensitivity; separate from
                daily fluctuations.
              </small>
            </span>
          </label>
        )}
      </DialogContent>
    </Dialog>
  );
}
