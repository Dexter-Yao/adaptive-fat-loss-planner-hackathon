"use client";
// ABOUTME: URL-only navigation between accepted overview, full-plan reading and proposal review.
// ABOUTME: Fragment selections never change sessions, facts, eligibility or acceptance and use no storage.
import { useSyncExternalStore } from "react";

export function parsePlanLocation(hash: string) {
  const [section, phaseStart, weekStart] = hash.replace(/^#/, "").split("/");
  if (["full-plan", "complete-plan"].includes(section))
    return { view: "full-plan" as const, phaseStart, weekStart };
  if (
    [
      "overview",
      "progress",
      "models",
      "weekly-guidance",
      "update-result",
    ].includes(section)
  )
    return { view: "overview" as const };
  if (
    ["review", "plan-comparison", "proposal-journey", "plan-decision"].includes(
      section,
    )
  )
    return { view: "review" as const };
  return { view: "automatic" as const };
}

const subscribe = (changed: () => void) => {
  window.addEventListener("hashchange", changed);
  window.addEventListener("popstate", changed);
  return () => {
    window.removeEventListener("hashchange", changed);
    window.removeEventListener("popstate", changed);
  };
};

export function usePlanLocation(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "",
  );
}

export function navigatePlan(
  fragment: string,
  {
    replace = false,
    scroll = true,
  }: { replace?: boolean; scroll?: boolean } = {},
): void {
  const oldURL = window.location.href;
  const url = `${window.location.pathname}${window.location.search}#${fragment}`;
  if (replace) window.history.replaceState(window.history.state, "", url);
  else if (window.location.hash !== `#${fragment}`)
    window.history.pushState(window.history.state, "", url);
  window.dispatchEvent(
    new HashChangeEvent("hashchange", { oldURL, newURL: window.location.href }),
  );
  if (scroll) window.scrollTo({ top: 0, behavior: "instant" });
}
