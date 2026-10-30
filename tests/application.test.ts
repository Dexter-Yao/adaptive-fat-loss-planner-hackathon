import { endpoint } from "../src/domain/forecast";
// ABOUTME: End-to-end domain commits for immediate diary saving, calendar edits and stale response recovery.
// ABOUTME: Uses the real calculator and session commands; synthetic explanations never stand in for live evidence.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CoachResultSchema,
  fourWeekStarts,
  addDays,
  type CoachRequest,
  type CoachResult,
} from "../src/domain/contracts";
import { exampleRequest } from "../src/domain/example";
import { enforceContext } from "../src/domain/context";
import { evaluatePlanning } from "../src/planning/evaluate";
import { presentationFor } from "./support/presentation";
import {
  createSession,
  buildCoachRequest,
  receiveCoachResult,
  saveDailyRecord,
  savePreferences,
  editAction,
  checkAction,
  acceptActionChanges,
  SessionSchema,
  type Session,
} from "../src/application/session";
import {
  analysisFresh,
  adviceUsable,
  planningPaused,
  effectiveTarget,
  remainingWeeks,
} from "../src/application/selectors";
import { migrateSession } from "../src/application/persistence";
const today = "2026-10-21";
function response(r: CoachRequest): CoachResult {
  const context = enforceContext(r),
    outcome = evaluatePlanning(r, context),
    presentation = outcome.forecast
      ? presentationFor(r)
      : {
          explanation: {
            headline: "Review your situation",
            summary:
              "Pause loss planning and check the supplied measurement or context.",
            whyForecast: "The current facts prevent a supported forecast.",
            question: null,
            changes: [],
          },
          newWeeks: [],
          actionChanges: [],
        };
  return CoachResultSchema.parse({
    ...outcome,
    ...presentation,
    context,
    sessionId: r.sessionId,
    sourceRevision: r.sourceRevision,
    actionsRevision: r.actionsRevision,
    asOfDate: r.asOfDate,
    provider: "codex",
    model: "synthetic-session-test",
    toolCalls: ["review_context", "forecast", "present_plan"],
  });
}
function ready(urgent = false): Session {
  const example = exampleRequest(today);
  if (urgent)
    example.goal.requestedDate = addDays(example.profile.startDate, 14);
  const initial = createSession(
      example.profile,
      example.goal,
      example.preferences,
      example.logs,
      true,
    ),
    request = buildCoachRequest(initial, today, "create");
  return receiveCoachResult(initial, request, response(request), today);
}
const newRecord = (date = today) => ({
  date,
  weightKg: 71.4,
  intake: { mode: "daily_total" as const, kcal: 2100 },
  bodyFat: null,
  steps: null,
  activity: { work: "very_light" as const, exercises: [] },
  notes: "Bought lunch.",
});
test("the first complete result installs exactly four weeks with stable IDs and one dated target history", () => {
  const s = ready();
  assert.deepEqual(
    s.weeklyPlans.map((w) => w.weekStart),
    fourWeekStarts(today),
  );
  assert.equal(s.targetRevisions.length, 1);
  assert.ok(
    s.weeklyPlans.every((w) =>
      w.actions.every((a) => a.id && a.dates.every((d) => d >= today)),
    ),
  );
  assert.ok(analysisFresh(s, today));
  assert.ok(adviceUsable(s, today));
  assert.deepEqual(migrateSession(JSON.stringify(s)), s);
});
test("a diary save survives reload and provider failure before any new analysis exists", () => {
  const before = ready(),
    after = saveDailyRecord(before, newRecord(), today),
    reopened = migrateSession(JSON.stringify(after));
  assert.deepEqual(reopened.logs.at(-1)?.intake, {
    mode: "daily_total",
    kcal: 2100,
  });
  assert.deepEqual(reopened.snapshot, before.snapshot);
  assert.deepEqual(reopened.weeklyPlans, before.weeklyPlans);
  assert.deepEqual(reopened.targetRevisions, before.targetRevisions);
  assert.equal(analysisFresh(reopened, today), false);
  assert.equal(adviceUsable(reopened, today), false);
  assert.equal(effectiveTarget(reopened, today, today), null);
});
test("correction replaces one date and keeps zero distinct from missing without inventing food records", () => {
  let s = ready();
  s = saveDailyRecord(
    s,
    { ...newRecord(), intake: { mode: "daily_total", kcal: 0 } },
    today,
  );
  const count = s.logs.length;
  s = saveDailyRecord(
    s,
    {
      ...newRecord(),
      weightKg: null,
      intake: null,
      bodyFat: null,
      steps: null,
      activity: null,
      notes: "",
    },
    today,
  );
  assert.equal(s.logs.length, count);
  assert.equal(s.logs.at(-1)?.intake, null);
  assert.equal(s.logs.at(-1)?.weightKg, null);
  assert.throws(
    () =>
      saveDailyRecord(
        s,
        { ...newRecord(addDays(today, -1)), date: addDays(today, 1) },
        today,
      ),
    /between|Future/,
  );
  assert.throws(
    () =>
      saveDailyRecord(
        s,
        {
          date: addDays(s.profile.startDate, -1),
          weightKg: 70,
          intake: null,
          bodyFat: null,
          steps: null,
          activity: null,
          notes: "",
        },
        today,
      ),
    /between/,
  );
});
test("an empty new day is rejected but an existing day may be cleared", () => {
  const s = ready();
  assert.throws(
    () =>
      saveDailyRecord(
        s,
        {
          date: today,
          weightKg: null,
          intake: null,
          bodyFat: null,
          steps: null,
          activity: null,
          notes: "",
        },
        today,
      ),
    /Add a measurement/,
  );
  const withRecord = saveDailyRecord(s, newRecord(), today);
  assert.equal(
    saveDailyRecord(
      withRecord,
      {
        date: today,
        weightKg: null,
        intake: null,
        bodyFat: null,
        steps: null,
        activity: null,
        notes: "",
      },
      today,
    ).logs.at(-1)?.notes,
    "",
  );
});
test("a delayed result cannot overwrite newer records, another session, another day or its input version", () => {
  const s = ready(),
    request = buildCoachRequest(s, today),
    answer = response(request);
  const changed = saveDailyRecord(s, newRecord(), today);
  assert.throws(
    () => receiveCoachResult(changed, request, answer, today),
    /inputs changed/,
  );
  assert.throws(
    () =>
      receiveCoachResult(
        s,
        request,
        { ...answer, sessionId: "another" },
        today,
      ),
    /inputs changed/,
  );
  assert.throws(
    () => receiveCoachResult(s, request, answer, addDays(today, 1)),
    /inputs changed/,
  );
  assert.throws(
    () =>
      receiveCoachResult(s, request, { ...answer, sourceRevision: 99 }, today),
    /inputs changed/,
  );
});
test("calendar edits and checkmarks leave the calculator inputs, observations and target history unchanged", () => {
  const before = ready(),
    week = before.weeklyPlans[0],
    action = week.actions[0];
  let s = editAction(
    before,
    week.weekStart,
    action.id,
    {
      kind: action.kind,
      title: "My bought lunch",
      details: "A personally selected option.",
      dates: [today],
    },
    today,
  );
  s = checkAction(s, action.id, today, "done", today);
  assert.deepEqual(s.logs, before.logs);
  assert.deepEqual(s.targetRevisions, before.targetRevisions);
  assert.equal(s.sourceRevision, before.sourceRevision);
  assert.ok(analysisFresh(s, today));
  assert.deepEqual(
    evaluatePlanning(buildCoachRequest(s, today)).forecast,
    evaluatePlanning(buildCoachRequest(before, today)).forecast,
  );
  assert.throws(
    () => checkAction(before, action.id, addDays(today, 1), "done", today),
    /Future/,
  );
});
test("a result may refresh numerics after a concurrent action edit but cannot replace user arrangements", () => {
  const s = ready(),
    request = buildCoachRequest(s, today),
    answer = response(request),
    action = s.weeklyPlans[0].actions[0];
  answer.actionChanges = [
    {
      kind: "edit",
      weekStart: s.weeklyPlans[0].weekStart,
      actionId: action.id,
      replacement: {
        kind: "nutrition",
        title: "Earlier model suggestion",
        details: "",
        dates: [today],
      },
      reason: "Based on an earlier arrangement.",
    },
  ];
  const edited = editAction(
    s,
    s.weeklyPlans[0].weekStart,
    action.id,
    {
      kind: "nutrition",
      title: "My newer choice",
      details: "Keep this.",
      dates: [today],
    },
    today,
  );
  const received = receiveCoachResult(edited, request, answer, today);
  assert.deepEqual(received.weeklyPlans, edited.weeklyPlans);
  assert.equal(received.pendingActionChanges, null);
  assert.ok(analysisFresh(received, today));
});
test("editing recurring future dates preserves checked and past occurrences as history", () => {
  let s = ready();
  const week = s.weeklyPlans[0],
    action = week.actions[0];
  s = checkAction(s, action.id, today, "done", today);
  const later = addDays(today, 2);
  s = editAction(
    s,
    week.weekStart,
    action.id,
    {
      kind: "nutrition",
      title: "New arrangement",
      details: "For remaining dates.",
      dates: [addDays(today, 3), addDays(today, 4)],
    },
    later,
  );
  const kept = s.weeklyPlans[0].actions.find((a) => a.id === action.id)!;
  assert.ok(kept.dates.includes(today));
  assert.equal(kept.checks[0].status, "done");
  assert.ok(kept.dates.includes(addDays(today, 1)));
  assert.equal(kept.title, action.title);
  assert.ok(
    s.weeklyPlans[0].actions.some(
      (a) => a.id !== action.id && a.title === "New arrangement",
    ),
  );
});
test("removing remaining dates never deletes a checked occurrence, and its check can be corrected", () => {
  let s = ready();
  const week = s.weeklyPlans[0],
    action = week.actions[0];
  s = checkAction(s, action.id, today, "done", today);
  s = editAction(s, week.weekStart, action.id, null, today);
  assert.deepEqual(s.weeklyPlans[0].actions[0].dates, [today]);
  assert.equal(s.weeklyPlans[0].actions[0].checks[0].status, "done");
  s = checkAction(s, action.id, today, null, today);
  assert.deepEqual(s.weeklyPlans[0].actions[0].checks, []);
});
test("Agent action changes remain pending until explicit acceptance and a matching version", () => {
  const s = ready(),
    request = buildCoachRequest(s, today),
    answer = response(request),
    action = s.weeklyPlans[0].actions[0];
  answer.actionChanges = [
    {
      kind: "edit",
      weekStart: s.weeklyPlans[0].weekStart,
      actionId: action.id,
      replacement: {
        kind: "nutrition",
        title: "A practical alternative",
        details: "Choose a bought meal.",
        dates: [today],
      },
      reason: "New practical context.",
    },
  ];
  const received = receiveCoachResult(s, request, answer, today);
  assert.deepEqual(received.weeklyPlans, s.weeklyPlans);
  assert.ok(received.pendingActionChanges);
  const accepted = acceptActionChanges(received, today);
  assert.equal(
    accepted.weeklyPlans[0].actions[0].title,
    "A practical alternative",
  );
  assert.deepEqual(accepted.logs, s.logs);
  assert.deepEqual(accepted.targetRevisions, s.targetRevisions);
  assert.throws(
    () =>
      acceptActionChanges(
        { ...received, actionsRevision: received.actionsRevision + 1 },
        today,
      ),
    /no longer current/,
  );
});
test("a newly saved scope change hides advice until assessed and never mutates the numerical baseline", () => {
  const s = ready(),
    updated = savePreferences(
      s,
      {
        ...s.preferences,
        context: "I am pregnant.",
      },
      today,
    );
  assert.throws(() =>
    savePreferences(
      s,
      { ...s.preferences, weightKg: 40 } as Parameters<
        typeof savePreferences
      >[1],
      today,
    ),
  );
  assert.equal(updated.profile.weightKg, s.profile.weightKg);
  assert.equal(adviceUsable(updated, today), false);
  const request = buildCoachRequest(updated, today),
    received = receiveCoachResult(updated, request, response(request), today);
  assert.equal(received.snapshot?.forecast, null);
  assert.equal(adviceUsable(received, today), false);
  assert.equal(effectiveTarget(received, today, today), null);
  assert.deepEqual(received.weeklyPlans, s.weeklyPlans);
  const pending = saveDailyRecord(
    received,
    {
      date: today,
      weightKg: 71.2,
      intake: null,
      bodyFat: null,
      steps: null,
      activity: null,
      notes: "A corrected observation while planning is paused.",
    },
    today,
  );
  assert.equal(analysisFresh(pending, today), false);
  assert.equal(planningPaused(pending), true);
  assert.equal(adviceUsable(pending, today), false);
});
test("only accepting a server-rechecked numerical proposal appends history and keeps the exact preview", () => {
  const s = ready(true),
    proposal = s.snapshot!.decision.proposal!;
  assert.ok(proposal);
  const request = buildCoachRequest(s, today, "accept", proposal.id),
    answer = response(request),
    next = receiveCoachResult(s, request, answer, today);
  assert.equal(next.targetRevisions.length, s.targetRevisions.length + 1);
  assert.deepEqual(next.targetRevisions.slice(0, -1), s.targetRevisions);
  assert.equal(
    next.snapshot?.forecast
      ? endpoint(next.snapshot.forecast, "accepted")?.weightKg
      : null,
    proposal.projectedWeightKg,
  );
  assert.deepEqual(next.weeklyPlans, s.weeklyPlans);
  const forged = {
    ...answer,
    targetRevisions: answer.targetRevisions.map((target, i) =>
      i ? target : { ...target, dailyCalories: 1400 },
    ),
  };
  assert.throws(() => receiveCoachResult(s, request, forged, today), /rewrite/);
});
test("dated targets take effect across midnight without labelling an old forecast as current", () => {
  let s = ready();
  const scheduled = {
    ...s.targetRevisions[0],
    effectiveFrom: addDays(today, 1),
    dailyCalories: 2000,
    targetDate: addDays(s.goal.requestedDate!, 14),
  };
  s = SessionSchema.parse({
    ...s,
    targetRevisions: [...s.targetRevisions, scheduled],
  });
  assert.equal(
    effectiveTarget(s, today, today)?.dailyCalories,
    s.targetRevisions[0].dailyCalories,
  );
  assert.equal(
    effectiveTarget(s, addDays(today, 1), addDays(today, 1))?.dailyCalories,
    2000,
  );
  assert.equal(analysisFresh(s, addDays(today, 1)), false);
});
test("a calendar-week rollover needs only one additional week and retains all previous arrangements", () => {
  const s = ready(),
    later = "2026-10-26";
  assert.equal(remainingWeeks(s, later).length, 1);
  const request = buildCoachRequest(s, later, "extend"),
    answer = response(request);
  assert.equal(answer.newWeeks.length, 1);
  const next = receiveCoachResult(s, request, answer, later);
  assert.equal(next.weeklyPlans.length, 5);
  assert.deepEqual(next.weeklyPlans.slice(0, 4), s.weeklyPlans);
  assert.deepEqual(remainingWeeks(next, later), []);
});

test("numerical updates do not silently certify AI actions against newly changed practical context", () => {
  const s = ready(),
    record = { ...newRecord(), notes: "I cannot cook for the next week." },
    changed = saveDailyRecord(s, record, today),
    request = buildCoachRequest(changed, today),
    answer = response(request);
  const numeric = receiveCoachResult(
    changed,
    request,
    {
      ...answer,
      provider: null,
      model: null,
      explanation: null,
      newWeeks: [],
      actionChanges: [],
    },
    today,
  );
  assert.equal(analysisFresh(numeric, today), true);
  assert.equal(adviceUsable(numeric, today), false);
  assert.deepEqual(numeric.weeklyPlans, s.weeklyPlans);
  const assessed = receiveCoachResult(
    numeric,
    buildCoachRequest(numeric, today),
    response(buildCoachRequest(numeric, today)),
    today,
  );
  assert.equal(adviceUsable(assessed, today), true);
});

test("pure measurement corrections retain reviewed action context without requiring another model call", () => {
  const s = ready(),
    changed = saveDailyRecord(s, { ...newRecord(), notes: "" }, today),
    request = buildCoachRequest(changed, today),
    answer = response(request),
    numeric = receiveCoachResult(
      changed,
      request,
      {
        ...answer,
        provider: null,
        model: null,
        explanation: null,
        newWeeks: [],
        actionChanges: [],
      },
      today,
    );
  assert.equal(adviceUsable(numeric, today), true);
});
