// ABOUTME: The approved product identity, shared by the welcome page and application shell.
// ABOUTME: This composition owns no navigation, account or application state.
import { Route } from "lucide-react";

export function Brand() {
  return (
    <span className="brand-lockup">
      <span className="brand-symbol" aria-hidden>
        <Route />
      </span>
      <span>
        <strong>Adaptive</strong>
        <span>Fat Loss Planner</span>
      </span>
    </span>
  );
}
