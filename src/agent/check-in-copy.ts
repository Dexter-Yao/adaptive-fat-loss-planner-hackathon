// ABOUTME: Focused checks for observed coach failures: wrong response language and undated/misidentified comparisons.
// ABOUTME: These bounded prose checks supplement typed evidence; they do not certify semantic quality or diagnose causes.
import { checkInComparisonIssues } from "./check-in-comparison";
import type { StageRequest } from "../domain/workflow";
import type { checkInReasoning } from "./check-in-reasoning";
export const CHECK_IN_COPY_VERSION = "check-in-copy-2026-10-30-v4";

/** Bound the observed English/Chinese failures; the shared language policy still owns other language choices. */
export function checkInLanguageHint(
  r: StageRequest,
): "Chinese" | "English" | null {
  const recent = r.measurements.findLast((m) => m.notes.trim())?.notes ?? "";
  const preferences = recent + "\n" + r.preferences.context;
  if (
    /(?:请用|使用|改用)(?:英文|英语)|(?:reply|answer|respond) in English/i.test(
      preferences,
    )
  )
    return "English";
  if (
    /(?:请用|使用|改用)中文|(?:reply|answer|respond) in Chinese/i.test(
      preferences,
    )
  )
    return "Chinese";
  if ((recent.match(/[\u3400-\u9fff]/g)?.length ?? 0) >= 8) return "Chinese";
  if (
    (recent.match(
      /\b(?:the|and|with|my|I|not|can|is|have|this|week|plan|lunch|dinner)\b/gi,
    )?.length ?? 0) >= 3
  )
    return "English";
  return null;
}

export function checkInCopyIssues(
  fields: { path: string; text: string }[],
  r: StageRequest,
  reasoning: ReturnType<typeof checkInReasoning>,
): string[] {
  const issues: string[] = checkInComparisonIssues(fields, reasoning);
  const reportedConditions = [
    r.preferences.context,
    ...r.measurements.map((m) => m.notes),
  ].join("\n");
  const conditionQuestion = fields.some(
    (f) =>
      f.path === "question" &&
      /(?:same|consistent|comparable).{0,160}(?:condition|scale|timing)|(?:condition|scale|timing).{0,160}(?:same|consistent|comparable)|条件.{0,100}(?:一致|相同)/i.test(
        f.text,
      ),
  );
  for (const { path, text } of fields) {
    if (!text.trim()) continue;
    if (
      path === "summary" &&
      text.length >= 480 &&
      !/[.!?。！？]$/.test(text.trim())
    )
      issues.push(
        "summary: Finish a short complete sentence. Do not fill the field to its limit and truncate the final clause; move detailed comparisons to evidence.",
      );
    for (const condition of [
      /fast(?:ed|ing)|empty stomach|overnight fast|before breakfast|空腹|早餐前/i,
      /light(?:weight)? cloth|轻便衣物|轻便衣服|轻装/i,
    ]) {
      if (
        condition.test(text) &&
        !condition.test(reportedConditions) &&
        /惯例|平常|以往|一贯|照常|usual|normal|routine/i.test(text)
      )
        issues.push(
          `${path}: This fasting/clothing condition was not reported as a habit. Ask what conditions differed or whether readings matched the reported scale/time; do not prescribe an unreported condition as the usual routine.`,
        );
    }
    if (
      !/可能|或许|may|might|could|cannot|can't/i.test(text) &&
      /(?:这次|本次|该次).{0,5}(?:读数|体重).{0,4}受.{0,50}影响|(?:reading|weight).{0,25}(?:was|is) (?:caused|affected) by/i.test(
        text,
      )
    )
      issues.push(
        `${path}: Differing measurement conditions are reported, but their effect on this reading is not established. State the changed conditions and need for a comparable measurement, without assigning a cause.`,
      );
    const hint = checkInLanguageHint(r);
    if (
      !reasoning.reportedMeasurements.some((m) => m.bodyFat) &&
      !r.measurements.some((m) =>
        /body.fat.{0,20}(?:method|device)|体脂.{0,12}(?:方法|设备|方式)|\b(?:BIA|DXA)\b/i.test(
          m.notes,
        ),
      ) &&
      /body.fat.{0,12}(?:method|device)|体脂.{0,10}(?:方法|设备|方式)/i.test(
        text,
      )
    )
      issues.push(
        `${path}: No body-fat check-in or method-change report was supplied. Omit body-fat method discussion; use only the reported weight/access facts.`,
      );
    if (
      /this (?:is|reflects|shows).{0,20}assumption difference|(?:forecast|projection).{0,35}(?:changed assumptions|assumptions? (?:have )?changed)|这(?:是|说明|反映).{0,12}假设(?:差异|变化)/i.test(
        text,
      )
    )
      issues.push(
        `${path}: A conditional forecast difference is not evidence the assumptions changed. Describe the dated model output and unknown observed cause; do not call it an assumption difference.`,
      );
    if (
      conditionQuestion &&
      path !== "question" &&
      /(?:measurement conditions|weigh.in conditions|scale|timing).{0,40}(?:are unchanged|have been unchanged|are the same|are consistent)|测量条件.{0,12}(?:没有变化|保持不变|始终一致)/i.test(
        text,
      )
    )
      issues.push(
        `${path}: You are asking whether measurement conditions were consistent, so do not also assert they were unchanged. Distinguish the reported routine from unconfirmed individual readings.`,
      );
    if (hint === "Chinese" && !/[\u3400-\u9fff]/.test(text))
      issues.push(
        `${path}: Answer this substantive Chinese check-in in Chinese, preserving only source quotes/keys/enums.`,
      );
    if (
      hint === "English" &&
      (text.match(/[a-z]/gi)?.length ?? 0) <=
        (text.match(/[\u3400-\u9fff]/g)?.length ?? 0)
    )
      issues.push(
        `${path}: Answer this substantive English check-in in English; the Chinese applicability examples are not this user's language.`,
      );
    if (
      reasoning.latestRecord &&
      (((reasoning.latestRecord.containsReportedWeight ||
        reasoning.latestRecord.containsReportedBodyFat) &&
        /no (?:new )?measurement|没有(?:新的)?测量|未提供(?:新的)?测量/i.test(
          text,
        )) ||
        (reasoning.latestRecord.containsReportedWeight &&
          /no (?:new )?weight measurement|未提供(?:新的)?体重/i.test(text)))
    )
      issues.push(
        `${path}: The supplied latest record includes a reported measurement. Do not call it absent or claim that a note establishes new numerical input.`,
      );
    if (
      !/may|could|might|可能|或许|无法|不确定/i.test(text) &&
      /(?:is|are) (?:within )?(?:the )?normal (?:variation|fluctuation)|常规变动范围|(?:属于|属|处于|为|是).{0,4}正常(?:波动|范围)/i.test(
        text,
      )
    )
      issues.push(
        `${path}: No calibrated normal-variation range is supplied. Describe uncertainty rather than asserting this reading is normal noise.`,
      );
  }
  return issues;
}
