// ABOUTME: Structured phase output must pass source, scope and numerical controls while old stored prose stays readable.
// ABOUTME: Synthetic providers exercise rejection/repair; live usefulness is evaluated separately with matched fictional requests.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  JourneyContentSchema,
  journeyContentIssues,
  type JourneyContent,
} from "../src/domain/journey";
import {
  GeneratedJourneyContentSchema,
  phaseGuidancePolicyIssues,
  journeySourceTools,
} from "../src/agent/phase-guidance";
import { generateJourneyContent } from "../src/agent/journey-content";
import { StageRequestSchema } from "../src/domain/workflow";
import { SessionSchema } from "../src/application/session";
import { receiveDraft, newBinding } from "../src/application/journey-commands";
import { PhaseGuidanceContent } from "../src/ui/phase-guidance-content";
import {
  journeyAgentFixture,
  journeyStageFixture,
  syntheticJourney,
  syntheticGuidanceContent,
} from "./support/journey-agent";
import type { PhaseGuidance } from "../src/domain/phase-guidance";
import type { AgentProvider } from "../src/agent/session";

test("saved phases stay optional, but new generation cannot silently submit old text instead of guidance", () => {
  const input = journeyAgentFixture(),
    content = syntheticJourney(input);
  delete content.phases[0].guidance;
  assert.ok(JourneyContentSchema.safeParse(content).success);
  assert.equal(GeneratedJourneyContentSchema.safeParse(content).success, false);
  const html = renderToStaticMarkup(
    createElement(PhaseGuidanceContent, { phase: content.phases[0] }),
  );
  assert.ok(html.includes(content.phases[0].focus));
  assert.ok(!html.includes("has no structured guidance"));
  assert.ok(!html.includes("<ul"));
});

test("structured detail is retained through saved content and canonical stage context", () => {
  const f = journeyStageFixture(),
    input = journeyAgentFixture(),
    content = syntheticJourney(input);
  // The fixture source values are identical; the application attaches its own session binding.
  const saved = receiveDraft(
    f.session,
    content,
    newBinding(f.session, f.request.binding.asOfDate),
  );
  assert.deepEqual(
    SessionSchema.parse(JSON.parse(JSON.stringify(saved))).journey.drafts[0]
      .content,
    content,
  );
  const request = StageRequestSchema.parse({
    ...f.request,
    acceptedDraft: saved.journey.drafts[0],
    acceptedStrategy: {
      headline: content.headline,
      summary: content.summary,
      phases: content.phases,
    },
  });
  assert.deepEqual(
    request.acceptedStrategy?.phases[0].guidance,
    content.phases[0].guidance,
  );
});

test("phase-level citations cannot invent source text even when overall personalization is valid", () => {
  const input = journeyAgentFixture(),
    content = syntheticJourney(input);
  content.phases[0].guidance!.evidence[0].quote =
    "I already established this habit.";
  assert.ok(
    journeyContentIssues(content, input.binding, input.sources, 60).some((i) =>
      /guidance.evidence/.test(i),
    ),
  );
});

const attacks: [string, (g: PhaseGuidance) => void, RegExp][] = [
  [
    "persistent hunger",
    (g) => {
      g.commitments = [
        "If hunger persists, slightly reduce the rice/noodle portion while keeping vegetables and protein.",
      ];
    },
    /Persistent hunger requires a review/,
  ],
  [
    "objective",
    (g) => {
      g.objective = "Eat 1400 kcal every day.";
    },
    /Numerical/,
  ],
  [
    "commitment",
    (g) => {
      g.commitments = ["Reach 70 kg by the end."];
    },
    /Numerical/,
  ],
  [
    "fallback",
    (g) => {
      g.obstacles[0].alternative = "Buy peanut butter instead.";
    },
    /excluded peanut/,
  ],
  [
    "question",
    (g) => {
      g.checkInQuestions = ["Track every meal in a food diary."];
    },
    /logging is deferred/,
  ],
  [
    "keep condition",
    (g) => {
      g.progression.keepWhen = "Keep eating 1300 calories.";
    },
    /Numerical/,
  ],
  [
    "review condition",
    (g) => {
      g.progression.discussChangeWhen = "Your body fat will reach 15%.";
    },
    /Numerical/,
  ],
  [
    "evidence reason",
    (g) => {
      g.evidence[0].reason = "This lets you consume 1200 kcal.";
    },
    /Numerical/,
  ],
];
for (const [label, mutate, issue] of attacks)
  test(`a ${label} cannot hide unsafe or unsupported advice in the structured phase`, async () => {
    const input = journeyAgentFixture(
        21,
        "I have a peanut allergy. No seafood. I can buy chicken, rice, tofu and vegetables.",
      ),
      good = syntheticJourney(input),
      bad = structuredClone(good);
    mutate(bad.phases[0].guidance!);
    const provider: AgentProvider = {
      name: "codex",
      model: "synthetic",
      async run(_p, _c, tools, h) {
        const rejected = await h(tools[0].name, syntheticGuidanceContent(bad));
        assert.equal(rejected.status, "rejected");
        assert.match(JSON.stringify(rejected), issue);
        assert.equal(
          (await h(tools[0].name, syntheticGuidanceContent(good))).status,
          "ok",
        );
      },
    };
    const result = await generateJourneyContent(input, provider);
    assert.deepEqual(result, good);
  });

test("phase exercise cannot bypass the weekly zero-time budget", () => {
  const c = syntheticJourney(journeyAgentFixture());
  c.phases[0].guidance!.commitments = ["Schedule a walk after lunch."];
  assert.ok(phaseGuidancePolicyIssues(c, 0).length);
  assert.deepEqual(phaseGuidancePolicyIssues(c, 60), []);
  c.phases[0].guidance!.commitments = [
    "Do not schedule workouts; keep the lunch choice simple.",
  ];
  assert.deepEqual(phaseGuidancePolicyIssues(c, 0), []);
});

test("structured detail uses real bullet fields rather than repeating/splitting the old focus paragraph", () => {
  const phase = syntheticJourney(journeyAgentFixture()).phases[0];
  const html = renderToStaticMarkup(
    createElement(PhaseGuidanceContent, { phase }),
  );
  assert.ok(html.includes("<ul"));
  assert.ok(html.includes(phase.guidance!.commitments[0]));
  assert.ok(html.includes("At your weekly check-in"));
  assert.ok(!html.includes(phase.focus));
  assert.ok(!html.includes("has no structured guidance"));
});

test("phase-level exercise duration cannot become a second numerical schedule", () => {
  const c = syntheticJourney(journeyAgentFixture());
  c.phases[0].guidance!.checkInQuestions = [
    "Were your two 30-minute walks workable?",
  ];
  assert.ok(
    phaseGuidancePolicyIssues(c, 60).some((i) =>
      i.includes("structured weekly activity"),
    ),
  );
  c.phases[0].guidance!.checkInQuestions = [
    "Did the planned walks fit your week?",
  ];
  assert.deepEqual(phaseGuidancePolicyIssues(c, 60), []);
  c.phases[0].guidance!.commitments = [
    "No kitchen, so schedule a walk after lunch.",
  ];
  assert.ok(phaseGuidancePolicyIssues(c, 0).length);
});

test("fewer-actions feedback must remove tasks, not just rephrase an unchanged weekly workload", async () => {
  const input = journeyAgentFixture(),
    good = syntheticJourney(input),
    previous = structuredClone(good);
  for (const w of previous.weeks)
    w.actions.push({
      ...w.actions[0],
      key: w.actions[0].key + "-extra",
      title: "Choose a separate evening meal",
    });
  input.previousDraft = {
    id: "preceding-draft",
    binding: input.binding,
    feedbackRevision: 0,
    content: previous,
  };
  input.feedback = {
    draftId: "preceding-draft",
    sourceRevision: 0,
    priorities: ["fewer_actions"],
    availableTrainingMinutes: null,
    requestedGoalDate: null,
    notes: "Only one lunch decision per week, with its fallback.",
  };
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run(_p, _c, tools, h) {
      const rejected = await h(
        tools[0].name,
        syntheticGuidanceContent(previous),
      );
      assert.notEqual(rejected.status, "ok");
      assert.match(JSON.stringify(rejected), /fewer weekly commitments/);
      assert.equal(
        (await h(tools[0].name, syntheticGuidanceContent(good))).status,
        "ok",
      );
    },
  };
  assert.deepEqual(await generateJourneyContent(input, provider), good);
});

test("journey tools select real source references; behavior theory cannot masquerade as personal evidence", () => {
  const input = journeyAgentFixture();
  const tools = journeySourceTools(input.sources);
  const {
    weeks: _weeks,
    goalStatus: _status,
    ...submitted
  } = syntheticGuidanceContent(syntheticJourney(input));
  const checked = tools.outlineSchema.parse(submitted);
  const canonical = tools.restore(checked);
  for (const reason of [
    ...canonical.whyForYou,
    ...canonical.phases.flatMap((p) => p.guidance.evidence),
  ])
    assert.ok(input.sources[reason.sourceId].includes(reason.quote));
  const wrong = structuredClone(submitted);
  wrong.phases[0].guidance!.evidence[0].sourceRef = "behavior#1";
  assert.equal(tools.outlineSchema.safeParse(wrong).success, false);
  const text = "a".repeat(449) + "🙂" + "z".repeat(100);
  const fragments = journeySourceTools({ original: text, alias: text }).options;
  assert.equal(fragments.map((s) => s.quote).join(""), text);
  assert.ok(fragments.every((s) => s.quote.length <= 500));
  assert.ok(fragments.every((s) => text.includes(s.quote)));
});

test("fewer-actions feedback also simplifies phase practices instead of leaving the old duties in place", async () => {
  const input = journeyAgentFixture();
  const good = syntheticJourney(input);
  const previous = structuredClone(good);
  previous.phases[0].guidance!.commitments = [
    "Choose a workable meal.",
    "Add a separate dinner practice.",
    "Complete another weekly task.",
  ];
  input.previousDraft = {
    id: "phase-prior",
    binding: input.binding,
    feedbackRevision: 0,
    content: previous,
  };
  input.feedback = {
    draftId: "phase-prior",
    sourceRevision: 0,
    priorities: ["fewer_actions"],
    availableTrainingMinutes: null,
    requestedGoalDate: null,
    notes: "Fewer distinct practices throughout the plan.",
  };
  const stalePhase = structuredClone(good);
  stalePhase.phases = previous.phases;
  const provider: AgentProvider = {
    name: "codex",
    model: "synthetic",
    async run(_p, _c, tools, handle) {
      const rejected = await handle(
        tools[0].name,
        syntheticGuidanceContent(stalePhase),
      );
      assert.notEqual(rejected.status, "ok");
      assert.match(JSON.stringify(rejected), /commitments/);
      assert.equal(
        (await handle(tools[0].name, syntheticGuidanceContent(good))).status,
        "ok",
      );
    },
  };
  assert.deepEqual(await generateJourneyContent(input, provider), good);
});
