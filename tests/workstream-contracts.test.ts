// ABOUTME: Compatibility checks preserve source-evidence identity, saved phase text and independent detail rendering.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceReasonSchema as JourneyEvidence } from "../src/domain/journey";
import { SourceReasonSchema } from "../src/domain/source-evidence";
import { PhaseGuidanceSchema } from "../src/domain/phase-guidance";
import { SessionSchema } from "../src/application/session";
import { PhaseFocus } from "../src/ui/phase-focus";
import { journeyHarness, fictionalInput } from "./support/journey-fixtures";

test("source evidence retains a single schema and preserves exact quotation whitespace", () => {
  assert.equal(JourneyEvidence, SourceReasonSchema);
  const raw = {
    sourceId: "context",
    quote: " exact source ",
    reason: " Reason ",
  };
  assert.deepEqual(SourceReasonSchema.parse(raw), { ...raw, reason: "Reason" });
});
test("old phase text round-trips without fabricating structured guidance", async () => {
  const h = journeyHarness();
  await h.controller.start(fictionalInput(), true);
  await h.controller.accept();
  for (const draft of h.state.journey.drafts)
    for (const phase of draft.content.phases)
      delete (phase as { guidance?: unknown }).guidance;
  const before = JSON.stringify(h.state);
  assert.equal(JSON.stringify(SessionSchema.parse(JSON.parse(before))), before);
  assert.ok(
    h.state.journey.drafts.every((d) =>
      d.content.phases.every((p) => !("guidance" in p)),
    ),
  );
  assert.equal(
    PhaseGuidanceSchema.safeParse({ objective: "Summary only" }).success,
    false,
  );
});
test("extracted phase detail retains verbatim summary and previous/next accessibility", () => {
  const html = renderToStaticMarkup(
    createElement(PhaseFocus, {
      phase: {
        startsOn: "2026-10-29",
        endsOn: "2026-11-08",
        current: true,
        label: "A workable routine",
        focus: "Keep this sentence; do not invent bullets.",
      },
      number: 1,
      total: 3,
      canPrevious: false,
      canNext: true,
      onPrevious() {},
      onNext() {},
    }),
  );
  assert.match(html, /<p>Keep this sentence; do not invent bullets\.<\/p>/);
  assert.match(html, /id="phase-focus"/);
  assert.match(html, /aria-label="Previous phase"[^>]*disabled=""/);
  assert.match(html, /aria-label="Next phase"/);
  assert.ok(!html.includes("<ul"));
});
