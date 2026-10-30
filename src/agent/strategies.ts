// ABOUTME: Small source-backed behavior-design briefs for the model's practical plan, not a clinical protocol.
// ABOUTME: Strategy selection changes advice, never physiology, numerical targets or user facts.
export const STRATEGY_VERSION = "behavior-briefs-2026-10-29-v3";
export const BEHAVIOR_BRIEFS = [
  {
    id: "action-planning",
    source: "https://doi.org/10.1007/s12160-013-9486-6",
    technique: "BCT 1.4",
    guidance:
      "Choose a small observable decision, linked to an existing cue, not an outcome promise. Give a usable action in a real context: where/when, an available option, a fallback and a check the user can answer without a food diary. Coordinate a few such practices with the whole eating pattern; do not mistake one meal choice for a complete programme. Use the person's actual meals/access rather than a default lunch example. Do not invent menu availability, kitchen equipment or nutrient numbers.",
  },
  {
    id: "solve-the-barrier",
    source: "https://doi.org/10.1007/s12160-013-9486-6",
    technique: "BCT 1.2",
    guidance:
      "Name the supplied practical barrier and adapt the action to it. Name a reported barrier as reported, and a possible future barrier as conditional. No kitchen means bought/ready-to-eat options, not batch cooking. A fallback must solve the same barrier, not merely say choose another healthy meal. Offer options, never assume the user has already done them.",
  },
  {
    id: "capability-opportunity",
    source: "https://doi.org/10.1186/1748-5908-6-42",
    technique: "COM-B",
    guidance:
      "Check skills, time, access and willingness separately. Work around missing access or time rather than prescribing more motivation. Current activity is distinct from future capacity; zero planned training time permits no scheduled workout. Low opportunity or time is not a motivation defect. Do not escalate intensity simply because a later week exists.",
  },
  {
    id: "repeat-and-consolidate",
    source: "https://doi.org/10.1007/s12160-013-9486-6",
    technique: "BCT 8.3 / 1.5",
    guidance:
      "Repeat a manageable choice in the same real context, then ask whether it was workable. Repetition is an intervention idea, not proof a habit formed. A later phase can consolidate the same choice rather than add effort; change only when user feedback gives a reason.",
  },
  {
    id: "conditional-progression",
    source: "https://doi.org/10.1007/s12160-013-9486-6",
    technique: "BCT 8.7 (bounded application)",
    guidance:
      "Graded tasks begin achievable; this app does not equate progression with harder exercise or less intake. Keep a feasible routine, simplify when burden rises, or discuss a user-chosen adjustment within confirmed capacity. No fixed phase count or calendar date establishes readiness.",
  },
  {
    id: "review-without-punishment",
    source: "https://doi.org/10.1007/s12160-016-9830-8",
    technique: "Adaptive-intervention design",
    guidance:
      "At a check-in, choose among keep, remeasure/clarify, change execution, propose a calculator-checked revision, or withhold unsuitable guidance. Identify the decision point, the reported tailoring information, available options and what would justify each option. No intervention can be appropriate. Separate a possible explanation from established facts. Do not infer overeating or a metabolic defect from one reading, prescribe compensation, or change accepted targets automatically.",
  },
] as const;

/** A compact brief, not the full literature or a claim these prompts improve weight outcomes. */
export function behaviorBrief(stage: "journey" | "review") {
  return {
    version: STRATEGY_VERSION,
    principles: BEHAVIOR_BRIEFS.filter((b) =>
      stage === "journey" ? b.id !== "review-without-punishment" : true,
    ),
  };
}
