// ABOUTME: Deterministic self-guided population boundary, reused before setup submission, inference and planning.
// ABOUTME: Broad saved profile contracts remain readable; a support boundary is not a diagnosis or medical clearance.
import type { ProfileFacts } from "./facts";
export const ELIGIBILITY_VERSION = "self-guided-scope-2026-10-29-v1";
export const SELF_GUIDED_AGE = { min: 18, max: 64 } as const;
export const ELIGIBILITY_QUESTION =
  "Before we start, does any of this apply to you?";
export const ELIGIBILITY_SUMMARY = `For adults aged ${SELF_GUIDED_AGE.min}–${SELF_GUIDED_AGE.max}. This prototype is not for pregnancy/breastfeeding, eating disorders or recovery, or health conditions/treatments that need individual nutrition or exercise guidance.`;
export const ELIGIBILITY_BOUNDARY_NOTE = `This is a self-guided prototype for adults aged ${SELF_GUIDED_AGE.min}–${SELF_GUIDED_AGE.max}. The age limit is a conservative product boundary, not a claim that older adults cannot lose weight safely.`;
export const ELIGIBILITY_DETAILS =
  "Pregnancy or breastfeeding; an eating disorder or recovery from one; a condition, medication or recent surgery affecting your weight, diet or exercise; or advice to lose weight only with clinical supervision. Examples include diabetes treatment, significant heart, kidney or liver disease, weight-loss medication and bariatric surgery. If unsure, choose professional guidance.";
export const ELIGIBILITY_OPTIONS = [
  { value: "standard", label: "None of these apply to me" },
  { value: "pregnant_or_breastfeeding", label: "Pregnant or breastfeeding" },
  {
    value: "clinical_guidance",
    label: "A health concern applies, or I am not sure",
  },
] as const;

export function assessPlanningEligibility(p: {
  ageYears: number | null;
  eligibility: ProfileFacts["eligibility"];
}) {
  const reasons: string[] = [];
  if (
    p.ageYears !== null &&
    (p.ageYears < SELF_GUIDED_AGE.min || p.ageYears > SELF_GUIDED_AGE.max)
  )
    reasons.push(
      `This self-guided prototype currently supports adults aged ${SELF_GUIDED_AGE.min}–${SELF_GUIDED_AGE.max}. Younger and older people need a more individualized assessment.`,
    );
  if (p.eligibility !== "standard")
    reasons.push(
      p.eligibility === "pregnant_or_breastfeeding"
        ? "Pregnancy and breastfeeding require different nutrition and weight guidance."
        : "Your situation needs individual advice from a qualified health professional before using a fat-loss plan.",
    );
  return {
    version: ELIGIBILITY_VERSION,
    supported: p.ageYears !== null && reasons.length === 0,
    reasons,
    message: reasons.length
      ? "Sorry, Adaptive is not suitable for this situation right now. " +
        reasons.join(" ") +
        " Please discuss a suitable approach with your clinician or registered dietitian."
      : null,
  };
}
export function assertPlanningEligibility(
  p: Pick<ProfileFacts, "ageYears" | "eligibility">,
): void {
  const result = assessPlanningEligibility(p);
  if (!result.supported) throw new Error(result.message!);
}
