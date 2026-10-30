"use client";
// ABOUTME: One prominent measurement action; the application still owns saving and forecast updates.
import { Button } from "@/components/ui/button";
import { ClipboardPlus } from "lucide-react";
export function MeasurementAction({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="outline"
      className="measurement-action"
      onClick={onClick}
      aria-label="Update measurements"
    >
      <span className="measurement-action-symbol" aria-hidden>
        <ClipboardPlus />
      </span>
      <span className="measurement-action-label">
        Update measurements<small>Weight, body fat &amp; notes</small>
      </span>
    </Button>
  );
}
