// ABOUTME: Read-only check-in presentation boundary shared by coaching logic and consuming UI.
// ABOUTME: Types derive from canonical Session owners; this interface adds no stored state or freshness policy.
import type { Session } from "./session";

export interface CheckInExperienceView {
  latest: Session["logs"][number] | null;
  review: (Session["journey"]["reviews"][number] & { current: boolean }) | null;
  numbersFresh: boolean;
  forecastAvailable: boolean;
  /** Hall change between conditional forecasts on this same future date, not an observed residual. */
  forecastChange: {
    date: string;
    value: number | null;
    unit: "kg" | "percentage points";
  } | null;
  /** Existing application freshness decision; not proof that a reported obstacle has been resolved. */
  guidanceFresh: boolean;
  task: {
    stage: "calculate" | "review_progress";
    working: boolean;
    error: string | null;
  } | null;
  canRequestReview: boolean;
}
