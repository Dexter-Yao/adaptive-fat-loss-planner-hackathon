// ABOUTME: One source of substantive requirements shared by plan creation/revision and offline evaluation.
// ABOUTME: These evidence-informed product requirements are not a clinical protocol or validated outcome measure.
export const PLAN_QUALITY_VERSION = "plan-quality-2026-10-30-v2";
export const PLAN_DIMENSIONS = [
  {
    id: "science_safety",
    title: "Scientific grounding and safety",
    titleZh: "科学依据与安全",
    questionZh: "方案的减脂机制、营养结构、数值依据与安全边界是否可靠？",
    boundary:
      "Whether the recommendation is scientifically defensible and safe, rather than whether access or willingness permits it.",
    requirements: [
      "Explain a sustainable energy deficit through feasible eating-pattern changes, rather than a magic food, spot reduction or exercise-only promise. Preserve adequate protein, varied plant/fibre sources and dietary fats/carbohydrates in a balanced pattern; do not demand a single macro ratio, supplements or nutrient counting. A body-fat goal also requires attention to retaining fat-free tissue, not merely scale loss.",
      "Use only supplied calculator-owned targets and conditional projections. Do not invent numerical prescriptions, promise a date, treat one practice as proof the full energy assumption is achieved, or confuse a scale/device change with proven fat, muscle or metabolic change. Explain a materially unmet goal honestly.",
      "Stay within the application's supported population and calculated limits. No crash restriction, compensatory fasting/exercise, medication advice or diagnosis. Reported red flags require appropriate withholding/referral rather than continued unsupervised fat-loss advice.",
      "Prototype support rule: persistent hunger calls for reviewing satisfaction, burden and assumptions, not further staple/portion restriction or skipped food. A credible general eating pattern can be assessed without measured nutrients, but food lists and prototype eligibility do not prove nutritional adequacy, clinical safety or medical clearance.",
    ],
    failureZh:
      "没有可信热量差路径、营养明显失衡、编造或误解数值、保证效果、把波动当组织变化，或越过安全边界。",
    sources: [
      "https://www.nice.org.uk/guidance/ng246/chapter/Physical-activity-and-diet",
      "https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner",
    ],
  },
  {
    id: "real_world_feasibility",
    title: "Physiological and environmental feasibility",
    titleZh: "身体与环境的现实可行性",
    questionZh: "身体能力、工作家庭安排、可获取食物与设施，能否支撑整段方案？",
    boundary:
      "Objective capability and external opportunity: ability, access, shift constraints, facilities and unavoidable responsibilities. Chosen effort and preference belong to agency_feedback.",
    requirements: [
      "Fit reported physical capabilities and external conditions: food access, cooking facilities, work hours, family/social context and actual resources. Do not prescribe unavailable menus, equipment, venues or freedom to leave work.",
      "Provide a coherent whole-horizon eating/activity strategy with usable alternatives for supplied obstacles; one isolated lunch tip is insufficient coverage of a full plan. An alternative must overcome the same obstacle, not depend on the condition already reported unavailable.",
      "When an external condition changes, make the replacement practicable now. Ask at most one high-value clarification only when a material fact is genuinely unknown. Do not claim an available option was already used or a reported barrier is measured intake/activity.",
    ],
    failureZh:
      "忽略身体能力或现实限制、虚构可用资源、备选仍受同一障碍阻挡，或只有局部技巧而没有完整执行路径。",
    sources: [
      "https://doi.org/10.1186/1748-5908-6-42",
      "https://www.nice.org.uk/guidance/ng246/chapter/Physical-activity-and-diet",
    ],
  },
  {
    id: "agency_feedback",
    title: "Chosen effort and feedback fidelity",
    titleZh: "意愿投入与反馈一致性",
    questionZh: "方案是否遵守用户愿意投入的时间精力、偏好、明确反馈和选择权？",
    boundary:
      "Subjective willingness, preferences and consent, rather than objective opportunity or how behavior develops over time.",
    requirements: [
      "Separate past routine, actual current activity and willing future effort. A training budget is a ceiling, not a quota. Zero willing training means no scheduled exercise, including prose-only commitments or fallbacks; dietary management can remain the chosen route.",
      "Honor explicit preferences, exclusions, requested timing flexibility and declined options. Revision must materially address the latest feedback while preserving still-valid constraints and useful content; do not merely rephrase or increase burden elsewhere.",
      "Present choices and calculator-checked proposals without declaring them accepted or silently changing the goal/date/targets. Keep the existing plan authoritative until explicit acceptance. Do not ask the person for a daily food/exercise diary or a chat interaction the app does not offer.",
    ],
    failureZh:
      "把过去或愿望当现实、擅自填满或提高投入、无视拒绝和修订反馈，或代替用户接受调整。",
    sources: [
      "https://www.nice.org.uk/guidance/ng246/chapter/Physical-activity-and-diet",
      "https://doi.org/10.1186/1748-5908-6-42",
    ],
  },
  {
    id: "behavior_adaptation",
    title: "Behavior change and adaptive progression",
    titleZh: "行为改变与阶段性动态支持",
    questionZh:
      "方案能否帮助此人开始、巩固与恢复，并根据连续信息选择保持、复测或讨论调整？",
    boundary:
      "Temporal execution: initiation, repetition, recovery, checkpoints and conditional adaptation. Numerical validity belongs to science_safety; consent belongs to agency_feedback.",
    requirements: [
      "Match the starting point: a novice rehearses a manageable cue/choice within willing effort; an experienced person preserves useful routines and investigates the reported barrier instead of restarting generic beginner advice. Provide concrete, observable weekly practices without requiring daily completion logging.",
      "Give phases distinct purposes across the actual horizon: establish a workable routine, consolidate/review, cope with disruption and prepare continuation/maintenance as applicable. Calendar passage is not evidence of habit formation or readiness; progression never requires automatic intensification.",
      "Use only the available history prefix. Distinguish isolated/noisy or method-changed readings from repeated comparable divergence; propose a comparable remeasurement when warranted, and address persistent obstacles rather than repeat reassurance. Do not infer a proven cause from a note or diagnose a plateau from one point.",
      "Make the next decision clear: keep, remeasure/clarify, adapt execution, propose a reviewed revision or pause. Include at least weekly measurement checkpoints, practical recovery alternatives and conditions for retaining or discussing change; no change can be the useful outcome.",
    ],
    failureZh:
      "阶段只是换标题、日历式自动加码、没有可执行起点或恢复路径、单点就过度调整，或对持续困难反复泛泛鼓励。",
    sources: [
      "https://doi.org/10.1007/s12160-013-9486-6",
      "https://pmc.ncbi.nlm.nih.gov/articles/PMC5364076/",
    ],
  },
] as const;
export type PlanDimensionId = (typeof PLAN_DIMENSIONS)[number]["id"];

/** Same substantive requirements for creation and revision; judging is separate, offline and evidence-based. */
export function planQualityBrief() {
  return { version: PLAN_QUALITY_VERSION, dimensions: PLAN_DIMENSIONS };
}
