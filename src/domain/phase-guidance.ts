// ABOUTME: Source-backed structured phase content shared by generated plans and their read-only detail.
// ABOUTME: Optional on saved phases for compatibility; fresh model output requires it at the Agent boundary.
import { z } from "zod";
import { SourceReasonSchema } from "./source-evidence";
const Text = z.string().trim().min(1).max(300);
export const PhaseGuidanceSchema = z
  .object({
    version: z.literal("phase-guidance-v1"),
    objective: Text,
    commitments: z.array(Text).min(1).max(3),
    obstacles: z
      .array(z.object({ barrier: Text, alternative: Text }).strict())
      .max(3),
    checkInQuestions: z.array(Text).min(1).max(3),
    progression: z.object({ keepWhen: Text, discussChangeWhen: Text }).strict(),
    evidence: z.array(SourceReasonSchema).min(1).max(5),
  })
  .strict();
export type PhaseGuidance = z.infer<typeof PhaseGuidanceSchema>;

/** Enumerate advice/reasons only; exact source quotations are not rewritten or treated as prescriptions. */
export function phaseGuidanceFields(
  g: PhaseGuidance,
): { path: string; text: string }[] {
  return [
    { path: "objective", text: g.objective },
    ...g.commitments.map((text, i) => ({ path: `commitments.${i}`, text })),
    ...g.obstacles.flatMap((o, i) => [
      { path: `obstacles.${i}.barrier`, text: o.barrier },
      { path: `obstacles.${i}.alternative`, text: o.alternative },
    ]),
    ...g.checkInQuestions.map((text, i) => ({
      path: `checkInQuestions.${i}`,
      text,
    })),
    { path: "progression.keepWhen", text: g.progression.keepWhen },
    {
      path: "progression.discussChangeWhen",
      text: g.progression.discussChangeWhen,
    },
    ...g.evidence.map((e, i) => ({
      path: `evidence.${i}.reason`,
      text: e.reason,
    })),
  ];
}
