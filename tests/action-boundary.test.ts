// ABOUTME: Calendar output must respect exact requested weeks, known identities and protected history.
import assert from "node:assert/strict";
import test from "node:test";
import { exampleRequest } from "../src/domain/example";
import { enforceContext } from "../src/domain/context";
import { presentationIssues } from "../src/agent/validation";
import { presentationFor } from "./support/presentation";
import { addDays } from "../src/domain/contracts";
const request = exampleRequest("2026-10-28");
test("the calendar boundary requires exactly the missing weeks and forbids past arrangements", () => {
  const p = presentationFor(request);
  assert.deepEqual(presentationIssues(p, request, true, "2026-10-28"), []);
  assert.match(
    presentationIssues(
      { ...p, newWeeks: p.newWeeks.slice(1) },
      request,
      true,
      "2026-10-28",
    ).join(),
    /exactly/,
  );
  const bad = structuredClone(p);
  bad.newWeeks[0].actions[0].dates = ["2026-10-27"];
  assert.match(
    presentationIssues(bad, request, true, "2026-10-28").join(),
    /before/,
  );
});
test("paused planning cannot issue new calendar actions or edits", () => {
  assert.match(
    presentationIssues(
      presentationFor(request),
      request,
      false,
      "2026-10-28",
    ).join(),
    /withheld/,
  );
  assert.deepEqual(
    presentationIssues(
      {
        explanation: presentationFor(request).explanation,
        newWeeks: [],
        actionChanges: [],
      },
      request,
      false,
      "2026-10-28",
    ),
    [],
  );
});
test("changes require an existing identity and cannot replace checked occurrences", () => {
  const r = structuredClone(request),
    week = presentationFor(request).newWeeks[0];
  r.weeklyPlans = [
    {
      ...week,
      actions: week.actions.map((a) => ({
        ...a,
        id: "known",
        editedByUser: true,
        checks: [{ date: "2026-10-28", status: "done" as const }],
      })),
    },
  ];
  const p = presentationFor(r);
  p.actionChanges = [
    {
      kind: "edit",
      weekStart: week.weekStart,
      actionId: "missing",
      replacement: { ...week.actions[0], dates: ["2026-10-28"] },
      reason: "A test edit.",
    },
  ];
  assert.match(
    presentationIssues(p, r, true, "2026-10-28").join(),
    /real existing/,
  );
  p.actionChanges[0].actionId = "known";
  assert.match(presentationIssues(p, r, true, "2026-10-28").join(), /checked/);
  p.actionChanges[0].replacement!.dates = [addDays("2026-10-28", 1)];
  assert.deepEqual(presentationIssues(p, r, true, "2026-10-28"), []);
});
test("known synonymous food restrictions merge evidence without collapsing different foods or scopes", () => {
  const r = exampleRequest("2026-10-28");
  r.preferences.foodPreferences = "No seafood. No eggs.";
  const context = enforceContext(r, {
    applicability: "standard",
    reason: null,
    constraints: [
      {
        kind: "food_exclusion",
        label: "No seafood",
        scope: "ongoing",
        untilDate: null,
        evidence: [{ sourceId: "profile.preferences", quote: "No seafood." }],
      },
    ],
    signals: [],
  });
  assert.equal(
    context.constraints.filter((c) => /seafood/i.test(c.label)).length,
    1,
  );
  assert.ok(context.constraints.some((c) => c.label === "egg"));
  assert.ok(context.constraints[0].evidence.length >= 1);
});

test("new weeks need a repeatable food routine for every remaining date without inventing past dates", () => {
  const p = presentationFor(request);
  p.newWeeks[0].actions[0].dates = ["2026-10-28"];
  assert.match(
    presentationIssues(p, request, true, "2026-10-28").join(),
    /missing these exact dates/,
  );
});
