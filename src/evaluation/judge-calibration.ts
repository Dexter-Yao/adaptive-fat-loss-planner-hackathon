// ABOUTME: Diagnose an offline judge against actual, separately supplied human annotations.
// ABOUTME: Binary judgments never promote a judge automatically; product review is not clinical validation.
import { z } from "zod";
import { HumanAnnotationSchema } from "./contracts";
export const HumanAssessmentSchema = z
  .object({
    rubricVersion: z.string().min(1),
    criterionId: z.string().min(1),
    annotation: HumanAnnotationSchema,
  })
  .strict();
export const JudgeAssessmentSchema = z
  .object({
    rubricVersion: z.string().min(1),
    criterionId: z.string().min(1),
    caseId: z.string().min(1),
    candidateRunId: z.uuid(),
    judgeRunId: z.uuid(),
    judgeConfigurationId: z.string().min(1),
    verdict: z.enum(["pass", "fail"]),
    critique: z.string().min(1),
  })
  .strict();
export function judgeCalibration(humanRaw: unknown[], judgeRaw: unknown[]) {
  const humans = humanRaw.map((v) => HumanAssessmentSchema.parse(v)),
    judges = judgeRaw.map((v) => JudgeAssessmentSchema.parse(v));
  if (new Set(judges.map((j) => j.judgeConfigurationId)).size > 1)
    throw Error("Compare one judge configuration at a time.");
  const key = (r: {
    rubricVersion: string;
    criterionId: string;
    caseId: string;
    runId: string;
  }) => JSON.stringify([r.rubricVersion, r.criterionId, r.caseId, r.runId]);
  const humanMap = new Map(
    humans.map((h) => [
      key({ ...h, caseId: h.annotation.caseId, runId: h.annotation.runId }),
      h,
    ]),
  );
  if (humanMap.size !== humans.length)
    throw Error(
      "Resolve duplicate human judgments explicitly; do not invent consensus.",
    );
  let resolvedPairs = 0,
    agreements = 0,
    falsePass = 0,
    falseFail = 0,
    unmatched = 0;
  const matched = new Set<string>();
  for (const j of judges) {
    const k = key({ ...j, runId: j.candidateRunId }),
      h = humanMap.get(k);
    if (!h) {
      unmatched++;
      continue;
    }
    if (matched.has(k))
      throw Error(
        "Compare one judge configuration at a time; duplicate predictions are not independent examples.",
      );
    matched.add(k);
    resolvedPairs++;
    if (j.verdict === h.annotation.verdict) agreements++;
    else if (j.verdict === "pass") falsePass++;
    else falseFail++;
  }
  return {
    status: "not_calibrated",
    automaticPromotion: false,
    humanCount: humans.length,
    judgeCount: judges.length,
    resolvedPairs,
    agreements,
    falsePass,
    falseFail,
    unmatched,
    humanWithoutPrediction: humans.length - matched.size,
    agreement: resolvedPairs ? agreements / resolvedPairs : null,
    note: "Diagnostics only. Review disagreements and independent cases with Dexter before approving a judge. A small longitudinal sample is not a population accuracy estimate.",
  };
}
