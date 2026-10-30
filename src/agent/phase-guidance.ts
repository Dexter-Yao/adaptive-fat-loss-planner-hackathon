// ABOUTME: Fresh journey tools require structured phases and select actual source references, restoring the saved canonical content.
// ABOUTME: Executable limits complement source/copy checks; they do not prove clinical usefulness or habit formation.
import { z } from "zod";
import {
  JourneyContentSchema,
  JourneyActionDraftSchema,
} from "../domain/journey";
import {
  PhaseGuidanceSchema,
  phaseGuidanceFields,
} from "../domain/phase-guidance";
import type { JourneyContent } from "../domain/journey";
import { SourceReasonSchema } from "../domain/source-evidence";
const GeneratedPhaseSchema = JourneyContentSchema.shape.phases.element.extend({
  guidance: PhaseGuidanceSchema,
});
export const GeneratedJourneyContentSchema = JourneyContentSchema.extend({
  phases: z.array(GeneratedPhaseSchema).min(1).max(8),
});

export const JOURNEY_SOURCE_CONTEXT_VERSION =
  "journey-sources-2026-10-30-activity-meaning-v1";
/** Code-owned field meanings, separate from verbatim personal evidence and future capacity. */
export const ACTIVITY_INPUT_MEANINGS = {
  work: "Current work-related physical activity intensity category. It describes bodily activity at work, not working hours, spare time, available time or future exercise willingness.",
  leisure:
    "Current non-work physical activity intensity category. It describes bodily activity outside work, not spare time, available time, energy available for tasks or future exercise willingness.",
  weeklyTrainingMinutes:
    "preferences.weeklyTrainingMinutes is the separately confirmed future weekly training willingness/capacity ceiling in minutes. Do not infer it from work or leisure categories, and do not treat it as completed activity or expenditure.",
} as const;

/** Supply source references rather than asking the model to copy quotes or invent source IDs. */
export function journeySourceTools(
  sources: Record<string, string>,
  practiceLimit = 3,
) {
  const seen = new Set<string>();
  const options: {
    sourceRef: string;
    sourceId: string;
    quote: string;
    description?: string;
  }[] = [];
  for (const [sourceId, text] of Object.entries(sources)) {
    const description =
      sourceId === "work" || sourceId === "leisure"
        ? ACTIVITY_INPUT_MEANINGS[sourceId]
        : undefined;
    // The same enum text on different activity axes is not the same fact.
    if (!text || (!description && seen.has(text))) continue;
    if (!description) seen.add(text);
    let part = 1;
    for (let offset = 0; offset < text.length; ) {
      let end = Math.min(offset + 450, text.length);
      const last = text.charCodeAt(end - 1);
      if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--;
      options.push({
        sourceRef: `${sourceId}#${part++}`,
        sourceId,
        quote: text.slice(offset, end),
        ...(description ? { description } : {}),
      });
      offset = end;
    }
  }
  if (!options.length)
    throw new Error("Provide actual user sources before generating a journey.");
  const Reference = z
    .object({
      sourceRef: z.enum(options.map((o) => o.sourceRef)),
      reason: SourceReasonSchema.shape.reason,
    })
    .strict();
  const Guidance = PhaseGuidanceSchema.omit({ evidence: true }).extend({
    commitments: PhaseGuidanceSchema.shape.commitments.max(practiceLimit),
    checkInQuestions:
      PhaseGuidanceSchema.shape.checkInQuestions.max(practiceLimit),
    evidence: z.array(Reference).min(1).max(5),
  });
  const Phase = GeneratedPhaseSchema.extend({ guidance: Guidance });
  const outlineSchema = GeneratedJourneyContentSchema.omit({
    weeks: true,
    whyForYou: true,
    phases: true,
  }).extend({
    whyForYou: z.array(Reference).min(1).max(5),
    phases: z.array(Phase).min(1).max(8),
  });
  const restoreReason = (reference: z.infer<typeof Reference>) => {
    const source = options.find((o) => o.sourceRef === reference.sourceRef);
    if (!source) throw new Error("Select only supplied sourceRef values.");
    return {
      sourceId: source.sourceId,
      quote: source.quote,
      reason: reference.reason,
    };
  };
  return {
    options,
    outlineSchema,
    restore(value: z.infer<typeof outlineSchema>) {
      return {
        ...value,
        whyForYou: value.whyForYou.map(restoreReason),
        phases: value.phases.map((p) => ({
          ...p,
          guidance: {
            ...p.guidance,
            evidence: p.guidance.evidence.map(restoreReason),
          },
        })),
      };
    },
  };
}

export const PLAN_COHERENCE_VERSION = "plan-coherence-2026-10-30-v8";
const PracticeId = z.enum(["p1", "p2", "p3"]);
const practiceText = z.string().trim().min(1).max(300);
/** Internal reusable proposals, stripped when restoring the canonical journey. */
export const JourneyPracticeSchema = z
  .object({
    id: PracticeId,
    kind: JourneyActionDraftSchema.shape.kind,
    title: JourneyActionDraftSchema.shape.title,
    details: practiceText,
    barrier: practiceText,
    fallback: practiceText,
    successCheck: practiceText,
  })
  .strict();
export type JourneyPractice = z.infer<typeof JourneyPracticeSchema>;

/** Narrow regression control: dropping one of two observed food decisions must also remove its fallback duty. */
export function simplificationPolicyIssues(
  content: JourneyContent,
  previous: JourneyContent,
): string[] {
  const portion =
    /先盛|盛少|少盛|少量.{0,4}主食|份量.{0,8}停顿|停顿|停頓|\b(?:smaller (?:serving|portion)|reduce (?:the )?portion|pause (?:before|after)|portion.{0,20}pause)\b/iu;
  const swap = /替换|替換|替代部分|\b(?:swap|replace|substitut\w*)\b/iu;
  const before = [
    ...new Set(
      previous.weeks.flatMap((w) =>
        w.actions.filter((a) => a.kind === "nutrition").map((a) => a.details),
      ),
    ),
  ];
  if (
    !before.some((text) => portion.test(text) && !swap.test(text)) ||
    !before.some((text) => swap.test(text) && !portion.test(text))
  )
    return [];
  const commitments = content.phases.flatMap(
    (p) => p.guidance?.commitments ?? [],
  );
  const keepsPortion = commitments.some((text) => portion.test(text));
  const keepsSwap = commitments.some((text) => swap.test(text));
  if (keepsPortion && keepsSwap)
    return [
      "fewer_actions: the preceding portion/pause and dish-substitution duties are both still mandatory. Keep one decision and remove the other instead of joining them into one practice.",
    ];
  const removed = keepsSwap ? portion : keepsPortion ? swap : null;
  if (!removed) return [];
  const fields = [
    { path: "summary", text: content.summary },
    { path: "reviewApproach", text: content.reviewApproach },
    ...content.phases.flatMap((p, index) => [
      { path: `phases.${index}.focus`, text: p.focus },
      ...(p.guidance
        ? phaseGuidanceFields(p.guidance)
            .filter((f) => !f.path.startsWith("evidence."))
            .map((f) => ({
              path: `phases.${index}.guidance.${f.path}`,
              text: f.text,
            }))
        : []),
    ]),
  ];
  return fields.flatMap(({ path, text }) =>
    text.split(/[.!?。！？;；\n]/u).flatMap((clause) => {
      const match = removed.exec(clause);
      if (
        !match ||
        /(?:不再|不要|不用|无需|無需|不必|取消|移除|删去|刪去|不要求|do not|don't|no longer|remove|drop)[^，,。！？;\n]{0,35}$/iu.test(
          clause.slice(0, match.index),
        )
      )
        return [];
      return [
        `${path}: fewer_actions removed this food duty; do not reintroduce it as an alternative, future intensification or compliance question. Keep the retained choice and normal meals, or discuss access/burden without prescribing the dropped rule. Text: ${clause}`,
      ];
    }),
  );
}

/** Long-horizon tools write each practice once; phases and weeks select it without rewriting portions. */
export function coherentStrategyTools(
  sources: ReturnType<typeof journeySourceTools>,
  practiceLimit: number,
) {
  const Phase = sources.outlineSchema.shape.phases.element;
  const Guidance = Phase.shape.guidance
    .omit({ commitments: true, obstacles: true })
    .extend({
      practiceIds: z.array(PracticeId).min(1).max(practiceLimit),
    });
  const outlineSchema = sources.outlineSchema.extend({
    practices: z.array(JourneyPracticeSchema).min(1).max(practiceLimit),
    finalWeekFocus: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .describe(
        "Used ONCE in the actual final calendar slot. Put whole-cycle/end-of-journey review here, never in a phase's reusable weeklyFocus.",
      ),
    finalCheckInLabel: z
      .string()
      .trim()
      .min(1)
      .max(90)
      .describe(
        "Checkpoint label for the actual final slot only; may review the completed whole cycle.",
      ),
    phases: z
      .array(
        Phase.extend({
          guidance: Guidance,
          weeklyFocus: z
            .string()
            .trim()
            .min(1)
            .max(180)
            .describe(
              "Reusable interim focus for EVERY non-final week intersecting this phase, INCLUDING the last phase. Review fit SO FAR or prepare continuation; never claim the whole cycle is completed. The phase ending at the goal date does not make all its weeks final.",
            ),
          weeklyCheckInLabel: z
            .string()
            .trim()
            .min(1)
            .max(90)
            .describe(
              "Interim weekly checkpoint, INCLUDING in the last phase. For example: Review this week's fit / 回顾本周适配情况. Not a whole-cycle review; that belongs only in finalCheckInLabel.",
            ),
        }),
      )
      .min(1)
      .max(8),
  });
  type Strategy = z.infer<typeof outlineSchema>;
  return {
    outlineSchema,
    repairIssues(value: Strategy, issues: string[]): string[] {
      // Validation reads canonical content; repairs must name the field the tool actually accepts.
      const located = issues.map((issue) =>
        issue.replace(
          /phases\.(\d+)\.guidance\.(?:commitments\.(\d+)|obstacles\.(\d+)\.(barrier|alternative))/g,
          (path, phaseIndex, commitmentIndex, obstacleIndex, obstacleField) => {
            const id =
              value.phases[Number(phaseIndex)]?.guidance.practiceIds[
                Number(commitmentIndex ?? obstacleIndex)
              ];
            const practiceIndex = value.practices.findIndex((p) => p.id === id);
            return practiceIndex < 0
              ? path
              : `practices.${practiceIndex}.${commitmentIndex !== undefined ? "details" : obstacleField === "alternative" ? "fallback" : "barrier"}`;
          },
        ),
      );
      return [...new Set(located)].filter(
        (issue) =>
          !issue.startsWith("Numerical ") ||
          !located.some((s) => s.includes(": " + issue)),
      );
    },
    issues(value: Strategy): string[] {
      const ids = value.practices.map((p) => p.id);
      const issues: string[] = [];
      if (new Set(ids).size !== ids.length)
        issues.push("practices: give each reusable practice a unique id.");
      for (const [index, phase] of value.phases.entries()) {
        const refs = phase.guidance.practiceIds;
        if (
          new Set(refs).size !== refs.length ||
          refs.some((id) => !ids.includes(id))
        )
          issues.push(
            `phases.${index}.guidance.practiceIds: select existing practices once each.`,
          );
      }
      if (
        ids.some(
          (id) =>
            !value.phases.some((p) => p.guidance.practiceIds.includes(id)),
        )
      )
        issues.push(
          "practices: every practice must belong to a phase; remove unused duties.",
        );
      return issues;
    },
    restore(value: Strategy) {
      const {
        practices,
        phases,
        finalWeekFocus: _finalFocus,
        finalCheckInLabel: _finalLabel,
        ...outline
      } = value;
      return sources.restore({
        ...outline,
        phases: phases.map((phase) => {
          const {
            weeklyFocus: _focus,
            weeklyCheckInLabel: _label,
            ...canonicalPhase
          } = phase;
          const { practiceIds, ...guidance } = phase.guidance;
          const selected = practiceIds.map((id) => {
            const practice = practices.find((p) => p.id === id);
            if (!practice)
              throw Error("Select existing practiceIds before restoration.");
            return practice;
          });
          return {
            ...canonicalPhase,
            guidance: {
              ...guidance,
              commitments: selected.map((p) => p.details),
              obstacles: selected.map((p) => ({
                barrier: p.barrier,
                alternative: p.fallback,
              })),
            },
          };
        }),
      });
    },
  };
}
/** Prevent an unbudgeted phase-level workout from evading the existing weekly-action budget. */
export function phaseGuidancePolicyIssues(
  content: JourneyContent,
  trainingMinutes: number,
): string[] {
  const issues = content.phases.flatMap((p, i) =>
    p.guidance
      ? phaseGuidanceFields(p.guidance)
          .filter(
            (f) =>
              /\b\d+(?:[.,]\d+)?[ -]*(?:minutes?|mins?|hours?|hrs?)\b|[\d零一二两兩三四五六七八九十百]+\s*(?:分钟|分鐘|小时|小時)|半(?:小时|小時)/i.test(
                f.text,
              ) &&
              // Preserve the duration guard except for explicit meal-pause/satiety timing.
              !(
                /\b(?:meal|eating|food|bite|seconds|satiety|fullness|hunger)\b|餐|饭|飯|筷|主食|吃完|饱|飽|饥饿|飢餓/iu.test(
                  f.text,
                ) &&
                /\b(?:pause|wait|satiety|fullness|hungry|hunger)\b|停顿|停頓|饱|飽|饿|餓/iu.test(
                  f.text,
                ) &&
                !/\b(?:walks?|walking|runs?|running|jog(?:ging)?|cycl(?:e|ing)|swim(?:ming)?|workouts?|exercise|training|sessions?|yoga)\b|散步|步行|走路|快走|运动|運動|训练|訓練|跑步|踏步|骑行|騎行|游泳|球|力量|抗阻|瑜伽|跳绳|跳繩/iu.test(
                  f.text,
                )
              ),
          )
          .map(
            (f) =>
              `phases.${i}.guidance.${f.path}: remove ALL numerical exercise durations, including parentheses/examples; refer to the structured weekly activity instead. Text: ${f.text}`,
          )
      : [],
  );
  if (trainingMinutes !== 0) return issues;
  return [
    ...issues,
    ...content.phases.flatMap((p, pi) => {
      if (!p.guidance) return [];
      const instructions = [
        ...p.guidance.commitments.map((text, i) => ({
          path: `commitments.${i}`,
          text,
        })),
        ...p.guidance.obstacles.map((o, i) => ({
          path: `obstacles.${i}.alternative`,
          text: o.alternative,
        })),
      ];
      return instructions
        .filter((f) =>
          f.text
            .split(/[.!?;,\n]/)
            .some(
              (clause) =>
                /\b(?:walk(?:ing)?|runs?|running|jog(?:ging)?|cycl(?:e|ing)|swim(?:ming)?|workouts?|exercise|strength train(?:ing)?|resistance train(?:ing)?|yoga)\b/i.test(
                  clause,
                ) &&
                !/\b(?:no|not|without|avoid|skip|don't|cannot|can't)\b/i.test(
                  clause,
                ),
            ),
        )
        .map(
          (f) =>
            `phases.${pi}.guidance.${f.path}: no planned exercise is available in the confirmed zero-time budget.`,
        );
    }),
  ];
}
