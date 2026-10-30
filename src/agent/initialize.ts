// ABOUTME: One bounded initial interpretation using fixed choices and exact source quotations.
// ABOUTME: Arithmetic, body-composition initialization and PAL mapping remain deterministic.
import { sectionedPrompt } from "./prompt-sections";
import {
  InitializationInputSchema,
  InitializationInterpretationSchema,
  InitializationReviewSchema,
  type InitializationInput,
} from "../domain/initialization";
import type { AgentProvider } from "./session";
import { estimateBaseline } from "../planning/inputs";
import { z } from "zod";
import { executeStage, type StageTrace } from "./stage-runtime";
import { assertPlanningEligibility } from "../domain/planning-eligibility";
import {
  RESPONSE_LANGUAGE_INSTRUCTIONS,
  responseLanguageContext,
} from "./response-language";
export const INITIALIZATION_PROMPT_VERSION =
  "initialization-2026-10-30-grounded-v10";
export const INITIALIZATION_INSTRUCTIONS = sectionedPrompt([
  {
    heading: "Task",
    body: String.raw`Review the ACTUAL adult inputs in the user context. Submit one present_initialization call.`,
  },
  {
    heading: "Response language",
    body:
      RESPONSE_LANGUAGE_INSTRUCTIONS +
      " Apply this to EVERY rationale explanation, including explanations for English activity enums. For a Chinese request, write an explanatory Chinese sentence such as '保留用户明确选择的当前工作活动类别。', never an English enum copied as an explanation. The example is a wording pattern, not an additional fact.",
  },
  {
    heading: "Authority and input trust",
    body: String.raw`You explain, not calculate. Return the selected work and leisure categories unchanged. Code owns physiology, PAL, expenditure and initial composition. Never invent a missing fact or turn future capacity into current exercise.`,
  },
  {
    heading: "Current activity and clarification",
    body: String.raw`First compare the selected CURRENT categories with what the person says they ACTUALLY do now. A material contradiction needs one clarification; preserving the category is not resolving the contradiction. Ask which account describes the recent routine, rather than ignoring explicit words such as "now". A selected activity category and a routine frequency are different facts; frequency alone does not establish an intensity contradiction or cover all nonroutine activity. Do not ask a generic confirmation of an already explicit routine. Put that one concise question in questions, ending in ?. If no question is needed, submit questions: []. Do not write "None", "null" or "N/A" as a question. Do not ask about facts already clear.`,
  },
  {
    heading: "Personalization and sources",
    body: String.raw`Use only facts in sources. Give one to three relevant rationale entries using the supplied evidenceId values; code restores the exact source quote. Omit unrelated dietary/body-fat explanations when they do not help this interpretation. An empty routines list means no routines entered, not proof that no exercise occurs. Never borrow the circumstances of an example.`,
  },
  {
    heading: "Decision examples",
    body: String.raw`Decision examples (patterns, not this user's facts):
- Selected almost no leisure activity, text only describes a future gym wish: keep current choices, explain future capacity is separate, no clarification.
- Same selection, text says exercise is happening now: keep choices for review but ask which describes the recent routine. Do not recast current exercise as a future wish.
- Seated work plus selected active leisure: preserve both; work does not erase leisure.
- Active work and no leisure training: preserve both; gym absence does not erase work movement.
- Reported body fat: retain its actual method. Unknown body fat: code will label its estimate; never invent a measurement.`,
  },
  {
    heading: "Tools and output",
    body: String.raw`For rationale, select an evidenceId and write only its explanation. Do not emit sourceId or quote fields. No age, sex, height, weight, calorie, PAL or metabolic numbers belong to your interpretation. Required missing body facts are rejected before this stage.`,
  },
]);
export async function reviewInitialization(
  raw: InitializationInput,
  provider?: AgentProvider,
  signal?: AbortSignal,
  options: {
    capturePayload?: boolean;
    onTrace?: (trace: StageTrace) => void;
    requestId?: string;
  } = {},
) {
  const input = InitializationInputSchema.parse(raw);
  assertPlanningEligibility(input.profile);
  const baseline = estimateBaseline(input.profile);
  if (!provider)
    return InitializationReviewSchema.parse({
      baseline,
      interpretation: null,
      aiStatus: "unavailable",
      message:
        "Your explicit choices can still be reviewed and used. AI interpretation is unavailable.",
      promptVersion: INITIALIZATION_PROMPT_VERSION,
    });
  const sources = {
    work: input.profile.activity.work,
    leisure: input.profile.activity.leisure,
    routines: JSON.stringify(input.profile.activity.routines),
    preferences: input.preferences.foodPreferences,
    context: input.preferences.context,
    bodyFat: JSON.stringify(input.profile.bodyFat),
  };
  const evidenceOptions = Object.entries(sources)
    .filter(
      ([id, text]) =>
        ["work", "leisure", "routines", "context"].includes(id) ||
        (id === "bodyFat" && text !== "null"),
    )
    .flatMap(([sourceId, text]) =>
      Array.from(
        { length: Math.max(1, Math.ceil(text.length / 300)) },
        (_, i) => ({
          sourceId: sourceId as keyof typeof sources,
          quote: text.slice(i * 300, (i + 1) * 300),
        }),
      ).filter((e) => e.quote.length),
    )
    .map((e, i) => ({ evidenceId: `i${i + 1}`, ...e }));
  const ids = evidenceOptions.map((e) => e.evidenceId) as [string, ...string[]];
  const ToolSchema = InitializationInterpretationSchema.omit({
    clarification: true,
  }).extend({
    questions: z
      .array(
        z
          .string()
          .min(1)
          .max(300)
          .regex(
            /\p{L}/u,
            "A clarification must contain actual question text, not only punctuation. If nothing needs clarification, submit questions: [].",
          )
          .regex(
            /[?？]\s*$/,
            "Ask one actual question ending in ?, or submit an empty questions array.",
          ),
      )
      .max(1),
    rationale: z
      .array(
        z
          .object({
            evidenceId: z.enum(ids),
            explanation:
              InitializationInterpretationSchema.shape.rationale.element.shape
                .explanation,
          })
          .strict(),
      )
      .min(1)
      .max(3),
  });
  const canonical = (value: z.infer<typeof ToolSchema>) => ({
    work: value.work,
    leisure: value.leisure,
    clarification: value.questions[0] ?? null,
    rationale: value.rationale.map((r) => {
      const source = evidenceOptions.find(
        (e) => e.evidenceId === r.evidenceId,
      )!;
      return {
        sourceId: source.sourceId,
        quote: source.quote,
        explanation: r.explanation,
      };
    }),
  });
  const result = await executeStage({
    stage: "interpretation",
    promptVersion: INITIALIZATION_PROMPT_VERSION,
    instructions: INITIALIZATION_INSTRUCTIONS,
    context: {
      responseLanguage: responseLanguageContext(input.preferences),
      sources,
      evidenceOptions,
      selected: input.profile.activity,
      goal: input.goal,
    },
    toolName: "present_initialization",
    toolDescription:
      "Submit source-supported semantic interpretation of explicit choices. Code owns the parameter mapping; ask one clarification for a material conflict.",
    schema: ToolSchema,
    validate: (value) => {
      const issues: string[] = [];
      if (value.work !== sources.work || value.leisure !== sources.leisure)
        issues.push(
          "Explicit selections cannot be replaced by inferred categories.",
        );
      canonical(value).rationale.forEach((r, i) => {
        if (!sources[r.sourceId].includes(r.quote))
          issues.push(
            `rationale.${i}.quote: use a literal substring of sources.${r.sourceId}; the submitted quote is not present. Copy a short exact excerpt rather than paraphrasing the source.`,
          );
      });
      return issues;
    },
    provider,
    timeoutMs: 60_000,
    maxSubmissions: 4,
    signal,
    ...options,
  });
  return InitializationReviewSchema.parse({
    baseline,
    interpretation: canonical(result.value),
    aiStatus: "completed",
    message: null,
    promptVersion: INITIALIZATION_PROMPT_VERSION,
  });
}
