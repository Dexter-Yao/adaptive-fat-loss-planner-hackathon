// ABOUTME: Model-facing weekly guidance selects code-owned activity options and checkpoint dates.
// ABOUTME: Adapts to the unchanged saved journey DTO; no actual activity, new expenditure or automatic acceptance is created.
import { z } from "zod";
import type { JourneyPractice } from "./phase-guidance";
import { addDays, startOfWeek, weekDates } from "../domain/facts";
import {
  JourneyActionDraftSchema,
  JourneyWeekDraftSchema,
  MAX_WEEKLY_ACTIONS,
  type JourneyBinding,
  type JourneyContent,
} from "../domain/journey";
type JourneyWeekDraft = JourneyContent["weeks"][number];

export const WEEKLY_GUIDANCE_VERSION =
  "weekly-guidance-2026-10-30-coherence-v6";
export function weeklyCommitmentLimit(
  previous: { actions: readonly unknown[] } | undefined,
  fewerRequested: boolean,
) {
  return previous && fewerRequested
    ? Math.max(1, previous.actions.length - 1)
    : MAX_WEEKLY_ACTIONS;
}
const actionFields = JourneyActionDraftSchema.shape;
export const GuidanceWeekSchema = z
  .object({
    focus: JourneyWeekDraftSchema.shape.focus,
    actions: z
      .array(
        z
          .object({
            kind: actionFields.kind,
            title: actionFields.title,
            details: actionFields.details,
            fallback: actionFields.fallback,
            successCheck: actionFields.successCheck,
            activityOptionIds: z.array(z.string().min(1).max(50)).max(1),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_WEEKLY_ACTIONS),
    checkInLabel: JourneyWeekDraftSchema.shape.checkIn.shape.label,
  })
  .strict();
type GuidanceWeek = z.infer<typeof GuidanceWeekSchema>;

/** Batch output selects whole-strategy practices, never a fresh dietary prescription. */
export function referencedWeekSchema(
  practices: JourneyPractice[],
  maxCommitments: number,
) {
  const [first, ...others] = practices.map((practice) =>
    z
      .object({
        practiceId: z.literal(practice.id),
        activityOptionIds:
          practice.kind === "movement"
            ? z.array(z.string().min(1).max(50)).max(1)
            : z
                .array(z.string())
                .length(0)
                .describe(
                  "Must be [] for this non-movement practice. Existing walking stays in the baseline; never attach its activity option to a food practice.",
                ),
      })
      .strict(),
  );
  if (!first)
    throw new Error("A weekly tool needs at least one declared practice.");
  const action = z.discriminatedUnion("practiceId", [first, ...others]);
  return GuidanceWeekSchema.pick({ actions: true }).extend({
    actions: z
      .array(action)
      .min(1)
      .max(maxCommitments)
      .describe(
        "Select each practiceId at most once. Multiple activity dates belong to one offered movement option, not duplicated actions. Do not invent a movement practice when the strategy declares none.",
      ),
  });
}

/** Restore exact practice text and check phase membership before the ordinary calendar/budget adapter. */
export function resolveReferencedWeeks(
  proposed: z.infer<ReturnType<typeof referencedWeekSchema>>[],
  practices: JourneyPractice[],
  slots: (Slot & {
    allowedPracticeIds: string[];
    maxCommitments: number;
    focus: string;
    checkInLabel: string;
  })[],
  budget: number,
  preceding: JourneyWeekDraft[] = [],
) {
  const issues: string[] = [];
  const expanded = proposed.map((week, index) => ({
    focus: slots[index]?.focus ?? "",
    checkInLabel: slots[index]?.checkInLabel ?? "",
    actions: week.actions.flatMap((action) => {
      const practice = practices.find((p) => p.id === action.practiceId);
      if (
        !practice ||
        !slots[index]?.allowedPracticeIds.includes(action.practiceId)
      ) {
        issues.push(
          `weeks.${index}: select only this slot's allowedPracticeIds.`,
        );
        return [];
      }
      const { id: _id, barrier: _barrier, ...fields } = practice;
      return [{ ...fields, activityOptionIds: action.activityOptionIds }];
    }),
  }));
  for (const [index, week] of proposed.entries()) {
    if (
      new Set(week.actions.map((a) => a.practiceId)).size !==
      week.actions.length
    )
      issues.push(
        `weeks.${index}: select each practice only once; dates do not create another commitment.`,
      );
    if (slots[index] && week.actions.length > slots[index].maxCommitments)
      issues.push(
        `weeks.${index}: follow this slot's maxCommitments ${slots[index].maxCommitments}.`,
      );
  }
  const resolved = resolveGuidanceWeeks(expanded, slots, budget, preceding);
  return { weeks: resolved.weeks, issues: [...issues, ...resolved.issues] };
}

export function guidanceCalendar(
  binding: JourneyBinding,
  budget: number,
  routineMinutes: number[],
) {
  const durations = [
    ...new Set([
      ...routineMinutes,
      10,
      15,
      20,
      30,
      45,
      60,
      Math.min(budget, 60),
    ]),
  ]
    .filter((m) => Number.isInteger(m) && m > 0 && m <= 240 && m <= budget)
    .sort((a, b) => a - b);
  const slots = [];
  for (
    let weekStart = startOfWeek(binding.startsOn);
    weekStart <= binding.endsOn;
    weekStart = addDays(weekStart, 7)
  ) {
    const activeDates = weekDates(weekStart).filter(
      (d) => d >= binding.startsOn && d <= binding.endsOn,
    );
    slots.push({
      weekStart,
      activeDates,
      checkInDate: activeDates[0],
      activityOptions: durations.flatMap((minutes) =>
        [1, 2, 3, 4, 5, 6, 7]
          .filter(
            (count) => count <= activeDates.length && minutes * count <= budget,
          )
          .map((count) => ({
            id: `m${minutes}x${count}`,
            minutesPerOccurrence: minutes,
            occurrences: count,
            weeklyMinutes: minutes * count,
          })),
      ),
    });
  }
  return slots.map((slot, index) => ({
    ...slot,
    weekIndex: index + 1,
    totalWeeks: slots.length,
    isFinalWeek: index === slots.length - 1,
  }));
}
type Slot = ReturnType<typeof guidanceCalendar>[number];

/** Preserve every intersecting phase when a calendar week crosses a phase boundary. */
export function associateGuidancePhases(
  slots: Slot[],
  phases: JourneyContent["phases"],
) {
  return slots.map((slot) => ({
    ...slot,
    phases: phases.flatMap((phase, index) => {
      const activeDates = slot.activeDates.filter(
        (date) => date >= phase.startsOn && date <= phase.endsOn,
      );
      return activeDates.length
        ? [{ phaseIndex: index + 1, label: phase.label, activeDates }]
        : [];
    }),
  }));
}

/** Reject the observed batch-end/whole-cycle wording error; semantic review remains independent. */
export function weeklyHorizonIssues(
  weeks: JourneyWeekDraft[],
  slots: Slot[],
): string[] {
  const wholeCycle =
    /(?:全程|全周期|全週期|整段).{0,6}(?:复盘|復盤|回顾|回顧|复核|複核)|(?:复盘|回顾|检视|檢視|总结|總結).{0,8}(?:整个|整個|全|整)(?:周期|週期|旅程|历程|歷程)|\b(?:review|reflect on|recap|wrap up|summari[sz]e)\b.{0,25}\b(?:whole|entire|full) (?:cycle|journey|plan|horizon)\b/iu;
  return weeks.flatMap((week) => {
    const slot = slots.find((s) => s.weekStart === week.weekStart);
    return slot &&
      !slot.isFinalWeek &&
      wholeCycle.test(`${week.focus}\n${week.checkIn.label}`)
      ? [
          `weeks.${week.weekStart}: this is global week ${slot.weekIndex} of ${slot.totalWeeks}, not the final week. Review fit so far, not the whole completed cycle.`,
        ]
      : [];
  });
}

/** Allocate optional sessions across this proposal's active dates; dates never become measured activity. */
export function resolveGuidanceWeeks(
  proposed: GuidanceWeek[],
  slots: Slot[],
  budget: number,
  preceding: JourneyWeekDraft[] = [],
): { weeks: JourneyWeekDraft[]; issues: string[] } {
  const issues: string[] = [],
    weeks: JourneyWeekDraft[] = [];
  if (proposed.length !== slots.length)
    return {
      weeks: [],
      issues: [
        `This batch needs exactly ${slots.length} weekly items, in the supplied slot order (${slots.map((s) => s.weekStart).join(", ")}). Do not return a partial horizon or earlier weeks.`,
      ],
    };
  for (const [index, week] of proposed.entries()) {
    const slot = slots[index];
    const weekStart = slot.weekStart;
    let totalMinutes = 0;
    const prior = preceding.find((w) => w.weekStart === weekStart);
    const usedKeys = new Set<string>();
    const actions = week.actions.map((action, index) => {
      const chosen = action.activityOptionIds[0];
      const option = slot.activityOptions.find((o) => o.id === chosen);
      if (action.kind === "nutrition" && chosen)
        issues.push(
          `${weekStart} action ${index + 1}: nutrition has no activity option; submit an empty array.`,
        );
      if (action.kind === "movement" && !option)
        issues.push(
          `${weekStart} action ${index + 1}: ${slot.activeDates.length} active day(s) remain in this slot. ${slot.activityOptions.length ? `Select exactly one of these activityOptionIds: ${slot.activityOptions.map((o) => o.id).join(", ")}. An empty array is invalid for movement; do not carry a full-week frequency into a partial week.` : "Zero capacity permits no movement action; remove it rather than submitting an empty activity option."}`,
        );
      const count =
        action.kind === "movement" && option ? option.occurrences : 1;
      const minutes =
        action.kind === "movement" && option
          ? option.minutesPerOccurrence
          : null;
      if (minutes !== null) totalMinutes += minutes * count;
      const generatedDates = Array.from(
        { length: count },
        (_, i) =>
          slot.activeDates[
            count === 1
              ? 0
              : Math.round((i * (slot.activeDates.length - 1)) / (count - 1))
          ],
      );
      const existing = prior?.actions.find(
        (a) =>
          a.kind === action.kind &&
          a.title === action.title &&
          !usedKeys.has(a.key),
      );
      const dates =
        existing &&
        existing.plannedMinutes === minutes &&
        existing.dates.length === count &&
        existing.dates.every((d) => slot.activeDates.includes(d))
          ? [...existing.dates]
          : generatedDates;
      const key =
        existing?.key ??
        `w${weekStart.replaceAll("-", "")}-${action.kind}-${index + 1}`;
      usedKeys.add(key);
      return {
        key,
        kind: action.kind,
        title: action.title,
        details: action.details,
        fallback: action.fallback,
        successCheck: action.successCheck,
        dates,
        plannedMinutes: minutes,
      };
    });
    if (totalMinutes > budget)
      issues.push(
        `${weekStart}: selected activity options total ${totalMinutes} minutes; the shared weekly limit is ${budget}. Choose fewer/smaller options. Nutrition uses no activity budget.`,
      );
    const checkInDate =
      prior && slot.activeDates.includes(prior.checkIn.date)
        ? prior.checkIn.date
        : slot.checkInDate;
    weeks.push({
      weekStart: weekStart,
      focus: week.focus,
      actions,
      checkIn: { date: checkInDate, label: week.checkInLabel },
    });
  }
  return { weeks, issues };
}
