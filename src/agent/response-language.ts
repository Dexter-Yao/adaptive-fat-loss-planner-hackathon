// ABOUTME: Shared model-facing language policy derived only from user text and retained content.
// ABOUTME: Interface copy, canonical keys/enums, source quotations and numerical authority are unchanged.
import type { PlanningPreferences } from "../domain/facts";

export const RESPONSE_LANGUAGE_INSTRUCTIONS = `The application interface is English, but user-facing generated content follows the user's language. Use the language of substantive recent user text, then onboarding context/preferences, then the preceding plan; use English only when no user-language evidence exists. A short acknowledgement, model name or quoted passage does not by itself change the user's language. Follow an explicit language preference when supplied. Apply this consistently to the headline, explanations, phases, weekly suggestions, questions and coaching. Preserve tool names, property names, enum values, identifiers and exact source quotations; translate neither evidence nor numerical values. Calculator-owned English interface notices are separate from generated prose. Translate their meaning naturally when relevant, without inventing a different outcome or forcing an English sentence into a non-English plan.`;

export function responseLanguageContext(
  preferences: Pick<PlanningPreferences, "context" | "foodPreferences">,
  recentUserText: string[] = [],
  previousContent = "",
) {
  return {
    recentUserText: recentUserText.filter((text) => text.trim()),
    onboardingText: [preferences.context, preferences.foodPreferences].filter(
      (text) => text.trim(),
    ),
    previousContentSample: previousContent.slice(0, 500),
    fallback:
      "English only when the supplied user-language evidence is absent.",
  };
}
