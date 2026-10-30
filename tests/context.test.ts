import { exampleRequest } from "../src/domain/example";
// ABOUTME: Adversarial source and copy checks for persistent constraints and scope gates.
// ABOUTME: Cases use synthetic adults and never infer clinical validity from a passing lexical guard.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CoachRequestSchema,
  type CoachRequest,
  type ContextAssessment,
  type Decision,
  type CoachExplanation,
} from "../src/domain/contracts";
import {
  enforceContext,
  getContextSources,
  explanationIssues as checkExplanation,
} from "../src/domain/context";

function request(
  preferences = "No seafood.",
  context = "Desk job.",
): CoachRequest {
  const base = exampleRequest("2026-10-28");
  base.profile.startDate = "2026-10-01";
  base.goal.requestedDate = "2026-12-24";
  base.preferences.mealSchedules[0].effectiveFrom = base.profile.startDate;
  return CoachRequestSchema.parse({
    ...base,
    action: "create",
    logs: [],
    preferences: { ...base.preferences, foodPreferences: preferences, context },
  });
}
function assessment(): ContextAssessment {
  return {
    applicability: "standard",
    reason: null,
    constraints: [],
    signals: [],
  };
}
type CopyFixture = CoachExplanation & {
  nutrition: string[];
  movement: string[];
  thisWeek: string;
};
function copy(overrides: Partial<CopyFixture> = {}): CopyFixture {
  return {
    headline: "A workable routine",
    summary: "Use the displayed plan as an estimate.",
    nutrition: ["Choose chicken and vegetables."],
    movement: ["Keep movement comfortable."],
    thisWeek: "Record meals and weigh under similar conditions.",
    changes: [],
    question: null,
    whyForecast:
      "The forecast uses the recorded baseline and assumptions; it does not measure personal metabolism.",
    ...overrides,
  };
}
function explanationIssues(
  value: CopyFixture,
  context: ContextAssessment,
  status: Decision,
) {
  const { nutrition, movement, thisWeek, ...text } = value;
  return checkExplanation(text, context, status, undefined, [
    ...nutrition.map((title) => ({ kind: "nutrition", title, details: "" })),
    ...movement.map((title) => ({ kind: "movement", title, details: "" })),
    { kind: "recording", title: thisWeek, details: "" },
  ]);
}
function decision(status: Decision["status"] = "active"): Decision {
  return {
    status,
    code: "test",
    title: "Test",
    summary: "Synthetic decision",
    facts: [],
    proposal: null,
    reviewMetrics: [],
  };
}

test("a nonbreaking hyphen in an exclusion reminder does not become a forbidden-food recommendation", () => {
  const context = enforceContext(request());
  for (const hyphen of ["-", "\u2010", "\u2011", "\u2013"]) {
    assert.deepEqual(
      explanationIssues(
        copy({ nutrition: [`Choose a seafood${hyphen}free tofu lunch.`] }),
        context,
        decision(),
      ),
      [],
    );
    assert.ok(
      explanationIssues(
        copy({
          nutrition: [
            `Choose a seafood${hyphen}free tofu lunch, then add shrimp.`,
          ],
        }),
        context,
        decision(),
      ).some((i) => i.includes("excluded shellfish")),
    );
  }
});

test("all nonempty historical notes reach the agent, including an allergy older than fourteen records", () => {
  const input = request("");
  input.logs = Array.from({ length: 20 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    weightKg: null,
    intake: null,
    bodyFat: null,
    steps: null,
    activity: null,
    notes: i === 0 ? "I have a severe peanut allergy." : `Workday ${i + 1}.`,
  }));
  input.logs.push({
    date: "2026-10-21",
    weightKg: null,
    intake: null,
    bodyFat: null,
    steps: null,
    activity: null,
    notes: "  ",
  });
  const sources = getContextSources(input);
  assert.equal(sources.length, 24);
  assert.equal(sources[0].id, "profile.preferences");
  assert.equal(sources[2].id, "profile.eligibility");
  assert.ok(
    sources.some(
      (source) =>
        source.id === "log:2026-10-01" &&
        source.text === "I have a severe peanut allergy.",
    ),
  );
  const allergy = enforceContext(input).constraints.find(
    (item) => item.kind === "allergy" && item.label === "peanut",
  );
  assert.equal(allergy?.evidence[0].sourceId, "log:2026-10-01");
});

test("editing or deleting a note removes the old constraint instead of retaining hidden memory", () => {
  const input = request("");
  input.logs = [
    {
      date: "2026-10-01",
      weightKg: null,
      intake: null,
      bodyFat: null,
      steps: null,
      activity: null,
      notes: "No eggs.",
    },
  ];
  const prior = enforceContext(input);
  assert.ok(prior.constraints.some((item) => item.label === "egg"));
  input.logs[0].notes = "I enjoy eggs.";
  assert.deepEqual(enforceContext(input).constraints, []);
  assert.throws(() => enforceContext(input, prior), /evidence does not match/);
  input.logs[0].notes = "";
  assert.deepEqual(enforceContext(input).constraints, []);
  assert.equal(getContextSources(input).length, 4);
});

test("candidate evidence must exactly match both source identity and quote", () => {
  const input = request("I avoid eggs.");
  const candidate = assessment();
  candidate.constraints = [
    {
      kind: "food_exclusion",
      label: "egg",
      scope: "ongoing",
      untilDate: null,
      evidence: [{ sourceId: "profile.preferences", quote: "I avoid fish." }],
    },
  ];
  assert.throws(
    () => enforceContext(input, candidate),
    /evidence does not match/,
  );
  candidate.constraints[0].evidence[0] = {
    sourceId: "log:2026-10-01",
    quote: "I avoid eggs.",
  };
  assert.throws(
    () => enforceContext(input, candidate),
    /evidence does not match/,
  );
});

test("model context cannot bypass numeric ownership or invent an unsupported gate without evidence", () => {
  const invalid = { ...assessment(), dailyCalories: 900 };
  assert.throws(() => enforceContext(request(), invalid as ContextAssessment));
  assert.throws(
    () =>
      enforceContext(request(), {
        ...assessment(),
        applicability: "unsupported",
      }),
    /source-backed unsupported signal/,
  );
});

test("English and Chinese food exclusions remain constraints while ordinary likes do not", () => {
  for (const text of [
    "No seafood.",
    "我不吃海鲜。",
    "I do not eat fish.",
    "Severe peanut allergy.",
    "Avoid shellfish.",
    "I am allergic to milk.",
    "我对鸡蛋过敏。",
    "Gluten-free diet.",
  ]) {
    assert.ok(enforceContext(request(text)).constraints.length > 0, text);
  }
  for (const text of [
    "I enjoy eggs.",
    "I like fish.",
    "I am not allergic to peanuts.",
    "我没有花生过敏。",
    "My sister has a peanut allergy.",
  ])
    assert.equal(enforceContext(request(text)).constraints.length, 0, text);
  assert.deepEqual(
    enforceContext(
      request("I have a peanut allergy but I enjoy eggs."),
    ).constraints.map((item) => item.label),
    ["peanut"],
  );
});

test("explicit eligibility overrides a model's standard assessment", () => {
  for (const eligibility of [
    "pregnant_or_breastfeeding",
    "clinical_guidance",
  ] as const) {
    const input = request();
    input.profile.eligibility = eligibility;
    const result = enforceContext(input, assessment());
    assert.equal(result.applicability, "unsupported");
    assert.equal(result.signals[0].evidence[0].sourceId, "profile.eligibility");
    assert.equal(result.signals[0].evidence[0].quote, eligibility);
  }
});

test("first-person pregnancy and breastfeeding pause scope without treating relatives or negatives as the user", () => {
  for (const text of [
    "I am pregnant.",
    "I'm breastfeeding.",
    "我现在怀孕了。",
    "我正在哺乳。",
  ])
    assert.equal(
      enforceContext(request("", text)).applicability,
      "unsupported",
      text,
    );
  for (const text of [
    "I am not pregnant.",
    "I am not currently breastfeeding.",
    "My sister is pregnant.",
    "My child is 8.",
    "我的姐姐怀孕了。",
    "我没有怀孕。",
    "I have no pregnancy symptoms.",
  ])
    assert.equal(
      enforceContext(request("", text)).applicability,
      "standard",
      text,
    );
});

test("first-person concerning symptoms produce a non-diagnostic confirmation gate", () => {
  for (const text of [
    "I fainted after running.",
    "I have chest pain.",
    "I keep feeling dizzy.",
    "我反复头晕。",
    "我昨天昏倒了。",
  ]) {
    const result = enforceContext(request("", text));
    assert.equal(result.applicability, "needs_confirmation", text);
    assert.ok(
      result.signals.some((signal) => signal.kind === "urgent_symptom"),
    );
  }
  for (const text of [
    "I have no chest pain.",
    "I have not fainted.",
    "My friend fainted.",
    "我没有胸痛。",
    "我的妈妈反复头晕。",
  ])
    assert.equal(
      enforceContext(request("", text)).applicability,
      "standard",
      text,
    );
});

test("hunger and unsustainable effort trigger feasibility signals rather than diagnosing illness", () => {
  for (const text of [
    "I am very hungry.",
    "I feel fatigued.",
    "I can't sustain this plan.",
    "我太累了，无法坚持。",
  ])
    assert.ok(
      enforceContext(request("", text)).signals.some(
        (signal) => signal.kind === "low_feasibility",
      ),
      text,
    );
  assert.equal(
    enforceContext(request("", "I am not hungry.")).signals.length,
    0,
  );
});

test("expired temporary limits disappear even if candidate labels them ongoing; original text stays available", () => {
  const input = request("No eggs until 2026-10-10.");
  const candidate = assessment();
  candidate.constraints = [
    {
      kind: "food_exclusion",
      label: "egg",
      scope: "ongoing",
      untilDate: null,
      evidence: [{ sourceId: "profile.preferences", quote: "No eggs" }],
    },
  ];
  assert.equal(enforceContext(input, candidate).constraints.length, 0);
  assert.equal(getContextSources(input)[0].text, "No eggs until 2026-10-10.");
  input.preferences.foodPreferences = "No eggs until 2026-10-30.";
  const active = enforceContext(input).constraints[0];
  assert.equal(active.scope, "temporary");
  assert.equal(active.untilDate, "2026-10-30");
});

test("old ongoing allergies do not expire merely because time passes", () => {
  const input = request("I have a severe peanut allergy.");
  input.logs = [
    {
      date: "2026-10-01",
      weightKg: null,
      intake: null,
      bodyFat: null,
      steps: null,
      activity: null,
      notes: "No eggs for today only.",
    },
  ];
  const result = enforceContext(input);
  assert.equal(result.constraints.length, 1);
  assert.equal(result.constraints[0].label, "peanut");
});

test("candidate can add a source-backed practical constraint beyond lexical fallbacks", () => {
  const input = request("", "I only have a kettle in my room.");
  const candidate = assessment();
  candidate.constraints = [
    {
      kind: "practical",
      label: "Kettle-only food preparation",
      scope: "ongoing",
      untilDate: null,
      evidence: [{ sourceId: "profile.context", quote: "only have a kettle" }],
    },
  ];
  assert.equal(
    enforceContext(input, candidate).constraints[0].label,
    "Kettle-only food preparation",
  );
});

test("agent prose cannot introduce competing calorie, weight or protein targets", () => {
  for (const summary of [
    "Eat 1800 kcal per day.",
    "Your target is 65 kg.",
    "Aim for 120 g protein.",
    "Your protein target is 120 grams.",
    "每天摄入1800千卡。",
    "每天120克蛋白质。",
  ])
    assert.ok(
      explanationIssues(copy({ summary }), assessment(), decision()).some(
        (issue) => issue.includes("Numerical"),
      ),
      summary,
    );
  assert.deepEqual(
    explanationIssues(
      copy({ summary: "Record 3 meals and review after 7 days." }),
      assessment(),
      decision(),
    ),
    [],
  );
});

test("food advice respects aliases, category exclusions and local negative reminders", () => {
  const context = enforceContext(
    request("No seafood. Severe peanut allergy. I avoid milk and eggs."),
  );
  for (const nutrition of [
    ["Choose salmon for dinner."],
    ["Add shrimp to lunch."],
    ["Try peanuts as a snack."],
    ["Choose yogurt for breakfast."],
    ["Breakfast: eggs and toast."],
    ["Eggs and toast for breakfast."],
  ])
    assert.ok(
      explanationIssues(copy({ nutrition }), context, decision()).some(
        (issue) => issue.includes("excluded"),
      ),
      nutrition[0],
    );
  assert.deepEqual(
    explanationIssues(
      copy({
        nutrition: [
          "Avoid eggs and seafood.",
          "Choose chicken without peanuts.",
          "Use dairy-free alternatives.",
        ],
      }),
      context,
      decision(),
    ),
    [],
  );
  assert.ok(
    explanationIssues(
      copy({ nutrition: ["Avoid seafood, then add eggs."] }),
      context,
      decision(),
    ).some((issue) => issue.includes("egg")),
  );
});

test("copy rejects guaranteed outcomes and invented personal-metabolism learning", () => {
  assert.deepEqual(
    explanationIssues(
      copy({ summary: "方案不承诺一定达成，而是提供可执行的原则。" }),
      assessment(),
      decision(),
    ),
    [],
  );
  assert.deepEqual(
    explanationIssues(
      copy({ summary: "先建立一定的饮食节奏，再根据测量复核减脂方案。" }),
      assessment(),
      decision(),
    ),
    [],
  );
  assert.deepEqual(
    explanationIssues(
      copy({ summary: "按当前假设不一定能达标，需要根据测量复核。" }),
      assessment(),
      decision(),
    ),
    [],
  );
  assert.ok(
    explanationIssues(
      copy({ summary: "不一定需要记录，但你一定可以达标。" }),
      assessment(),
      decision(),
    ).some((issue) => issue.includes("guarantee")),
  );
  assert.ok(
    explanationIssues(
      copy({ summary: "You will reach your target by the date." }),
      assessment(),
      decision(),
    ).some((issue) => issue.includes("guarantee")),
  );
  assert.ok(
    explanationIssues(
      copy({ whyForecast: "The model has learned your personal metabolism." }),
      assessment(),
      decision(),
    ).some((issue) => issue.includes("metabolism")),
  );
  assert.deepEqual(
    explanationIssues(
      copy({
        summary: "We cannot guarantee a particular result.",
        whyForecast: "The model has not learned your metabolism.",
      }),
      assessment(),
      decision(),
    ),
    [],
  );
});

test("paused or confirmation states permit measurement support but reject deficit and weight-loss exercise directions", () => {
  for (const status of ["paused", "needs_confirmation"] as const) {
    for (const summary of [
      "Keep a calorie deficit.",
      "Reduce your intake while waiting.",
      "Run every day to burn fat.",
      "增加跑步来减脂。",
    ])
      assert.ok(
        explanationIssues(
          copy({ summary }),
          assessment(),
          decision(status),
        ).some((issue) => issue.includes("paused")),
        summary,
      );
    assert.deepEqual(
      explanationIssues(
        copy({
          summary:
            "Pause weight-loss planning and ask a qualified professional for help.",
          nutrition: [
            "Do not follow a calorie deficit while awaiting guidance.",
          ],
          movement: [],
          question: "Can you confirm the measurement on the same scale?",
        }),
        assessment(),
        decision(status),
      ),
      [],
    );
  }
});

test("a proposal is not described as applied, and changed deterministic facts cannot be called unchanged", () => {
  const pending = decision("review");
  pending.proposal = {
    id: "p",
    kind: "extend_timeline",
    title: "More time",
    reason: "Observed trend",
    dailyCalories: 1800,
    targetDate: "2027-01-10",
    projectedWeightKg: 68,
    effectiveFrom: "2026-10-28",
  };
  assert.ok(
    explanationIssues(
      copy({ changes: ["Extended your target date."] }),
      assessment(),
      pending,
    ).some((issue) => issue.includes("pending proposal")),
  );
  assert.deepEqual(
    explanationIssues(
      copy({
        changes: ["Proposed a longer timeline; it has not been accepted."],
      }),
      assessment(),
      pending,
    ),
    [],
  );
  const applied = decision();
  applied.facts = ["The calorie target changed after the accepted revision."];
  assert.ok(
    explanationIssues(
      copy({ changes: ["No plan change."] }),
      assessment(),
      applied,
    ).some((issue) => issue.includes("unchanged")),
  );
  assert.ok(
    explanationIssues(
      copy({ changes: ["Reduced your calories."] }),
      assessment(),
      decision(),
    ).some((issue) => issue.includes("invent")),
  );
  const stable = decision();
  stable.facts = ["The calorie target remains unchanged."];
  assert.deepEqual(
    explanationIssues(
      copy({ changes: ["No plan change."] }),
      assessment(),
      stable,
    ),
    [],
  );
});

test("real provider wording distinguishes unchanged accepted targets and practical updates from numerical revisions", () => {
  const pending = decision("review");
  pending.proposal = {
    id: "p",
    kind: "extend_timeline",
    title: "More time",
    reason: "Observed trend",
    dailyCalories: 1800,
    targetDate: "2027-01-10",
    projectedWeightKg: 68,
    effectiveFrom: "2026-10-28",
  };
  const stable = decision();
  stable.facts = ["The accepted calorie target and date remain unchanged."];
  for (const current of [stable, pending]) {
    assert.deepEqual(
      explanationIssues(
        copy({
          changes: ["The accepted calorie target and date remain unchanged."],
        }),
        assessment(),
        current,
      ),
      [],
    );
    assert.deepEqual(
      explanationIssues(
        copy({
          changes: ["Updated practical food choices to ready-to-eat meals."],
        }),
        assessment(),
        current,
      ),
      [],
    );
    for (const change of [
      "I reduced your calorie target.",
      "I extended the accepted deadline.",
    ]) {
      const issues = explanationIssues(
        copy({ changes: [change] }),
        assessment(),
        current,
      );
      assert.ok(
        issues.some((issue) =>
          issue.includes(current.proposal ? "pending proposal" : "invent"),
        ),
        change,
      );
    }
  }
});

test("non-seafood alternatives are allowed without hiding a separate excluded fish recommendation", () => {
  const context = enforceContext(request("No seafood."));
  assert.deepEqual(
    explanationIssues(
      copy({ nutrition: ["Choose a non-seafood rice bowl."] }),
      context,
      decision(),
    ),
    [],
  );
  assert.ok(
    explanationIssues(
      copy({ nutrition: ["Choose a non-seafood rice bowl and salmon."] }),
      context,
      decision(),
    ).some((issue) => issue.includes("fish")),
  );
});
