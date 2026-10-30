// ABOUTME: Bind English/Chinese comparison clauses to calculator-owned dates, measures and comparison types.
// ABOUTME: Natural wording may vary; every named observation and direction must still match pre-update evidence.
import type { checkInReasoning } from "./check-in-reasoning";

type Evidence = ReturnType<typeof checkInReasoning>;
type Field = { path: string; text: string };

const comparison =
  /(?:above|below|higher|lower|close).{0,40}(?:predict|project|forecast|model|reference|expected)|(?:高于|低于|接近|相近).{0,24}(?:预测|模型|参考)|(?:预测|模型|参考).{0,24}(?:更高|更低|上调|下调|接近|相近)/i;
const observation =
  /\b(?:readings?|measurements?|observed|observations?|residuals?)\b|读数|实测|测量|观测|残差/i;
const prior =
  /pre[ -]?update|before.{0,40}(?:incorporat|updat)|same[ -]?day|(?:prior|previous|earlier).{0,25}(?:Hall|predict|model)|更新前|纳入前|同日|当日|(?:此前|先前|当时|对应日期|各自).{0,12}(?:预测|模型)/i;
const future =
  /future|endpoint|outlook|goal.date|horizon|conditional (?:weight |body.fat )?projection|未来|终点|展望|目标日期/i;

/** Resolve calendar wording only against supplied evidence; an omitted year must identify one date. */
function mentionedDates(text: string, evidence: Evidence): string[] {
  const available = [
    ...new Set([
      ...evidence.reportedMeasurements.map((m) => m.date),
      ...(evidence.futureProjectionComparison
        ? [evidence.futureProjectionComparison.date]
        : []),
    ]),
  ];
  const found = new Set(text.match(/\d{4}-\d{2}-\d{2}/g) ?? []);
  const add = (month: number, day: number, year?: string) => {
    const suffix = `-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const matches = available.filter((date) => date.endsWith(suffix));
    found.add(
      year
        ? year + suffix
        : matches.length === 1
          ? matches[0]
          : `unbound:${month}/${day}`,
    );
  };
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const month =
    "(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)";
  for (const m of text.matchAll(
    new RegExp(
      `(?<![\\d-])(\\d{1,2}(?:(?:,\\s*|\\s+and\\s+)\\d{1,2})*)\\s+${month}\\b(?:\\s+(\\d{4}))?`,
      "gi",
    ),
  ))
    for (const day of m[1].match(/\d+/g)!)
      add(
        months.indexOf(m[2].slice(0, 3).toLowerCase()) + 1,
        Number(day),
        m[3],
      );
  for (const m of text.matchAll(
    new RegExp(`\\b${month}\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?`, "gi"),
  ))
    add(months.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, Number(m[2]), m[3]);
  for (const m of text.matchAll(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/g))
    add(Number(m[2]), Number(m[3]), m[1]);
  return [...found];
}

function clauses(fields: Field[], evidence: Evidence) {
  return fields.flatMap(({ path, text }) =>
    text
      .split(
        /[。！？!?\n；;]|(?<=\.)\s+|,\s*(?:but|whereas|while)\s+|,\s*and\s+(?=the (?:calculator|future|forecast|projection))|，(?:但是|但|而)/i,
      )
      .map((text) => ({
        path,
        text: text.replace(
          /\bnot (?:a |the )?(?:future|endpoint|outlook|goal.date|horizon)[^,;]*|不是(?:未来|终点|展望|目标日期)[^，；]*/gi,
          "",
        ),
      }))
      .filter((c) => comparison.test(c.text))
      .map((c) => ({
        ...c,
        dates: mentionedDates(c.text, evidence),
        bodyFat: /body.fat|体脂/i.test(c.text),
        observed: observation.test(c.text),
        prior: prior.test(c.text),
        future: future.test(c.text),
      })),
  );
}

/** A grouped reference can reuse a dated claim in this output, never an unrelated future comparison. */
export function bindCheckInComparisons(
  fields: Field[],
  evidence: Evidence,
): {
  issues: string[];
  observations: { date: string; measure: "weight" | "body_fat" }[];
} {
  const issues: string[] = [],
    claims = clauses(fields, evidence);
  const observations: { date: string; measure: "weight" | "body_fat" }[] = [];
  const residuals = (bodyFat: boolean) =>
    bodyFat
      ? (evidence.sameDayObservationResiduals?.bodyFat ?? []).map((e) => ({
          date: e.date,
          delta: e.residualPct,
        }))
      : (evidence.sameDayObservationResiduals?.weight ?? []).map((e) => ({
          date: e.date,
          delta: e.residualKg,
        }));
  for (const c of claims) {
    const points = residuals(c.bodyFat);
    const isFuture =
      c.future ||
      (!c.observed &&
        !c.prior &&
        c.dates.includes(
          evidence.futureProjectionComparison?.date ?? "\u0000",
        ));
    let deltas: number[] = [];
    if (isFuture) {
      const f = evidence.futureProjectionComparison;
      if (
        c.observed ||
        (c.prior && c.dates.some((d) => points.some((p) => p.date === d))) ||
        !f ||
        !c.dates.includes(f.date)
      ) {
        issues.push(
          `${c.path}: Bind a future projection comparison to its common future date (${f?.date ?? "unavailable"}) and reference/updated projections. Do not describe that difference as an observed reading or pre-update residual.`,
        );
        continue;
      }
      const delta = c.bodyFat
        ? f.changesFromReference.bodyFatPp
        : f.changesFromReference.weightKg;
      if (delta === null) {
        issues.push(
          `${c.path}: No future comparison is available for this measure.`,
        );
        continue;
      }
      deltas = [delta];
    } else {
      if (
        /after.{0,30}(?:incorporat|updat)|post[ -]?update|fitted|纳入后|更新后|拟合/i.test(
          c.text,
        )
      ) {
        issues.push(
          `${c.path}: A fitted/post-update point is not an independent observation prediction; use the supplied pre-update residual instead.`,
        );
        continue;
      }
      let dates = c.dates;
      let typed = c.prior;
      if (
        !dates.length &&
        /\blatest (?:weight )?(?:reading|check.in)|本次(?:体重|读数)|最新(?:体重|读数)/i.test(
          c.text,
        )
      )
        dates = evidence.latestRecord ? [evidence.latestRecord.date] : [];
      // "Those three higher-than-predicted readings" can refer to the explicitly
      // dated/prior-prediction claim in another sentence of this same output.
      if (
        !dates.length &&
        /(?:these|those|the (?:two|three|four|consecutive|repeated)).{0,70}(?:readings|measurements)|这(?:些|几次|[两三四]次).{0,30}(?:读数|测量)/i.test(
          c.text,
        )
      ) {
        const anchors = claims.filter(
          (a) =>
            a !== c &&
            a.bodyFat === c.bodyFat &&
            a.observed &&
            a.prior &&
            !a.future &&
            a.dates.length &&
            a.dates.every((d) => points.some((p) => p.date === d)),
        );
        dates = [...new Set(anchors.flatMap((a) => a.dates))];
        typed = anchors.length > 0;
      }
      // A count plus calendar weekday can identify the entire supplied set,
      // not an arbitrary subset or unconfirmed measurement conditions.
      if (!dates.length) {
        const words = [
          "zero",
          "one",
          "two",
          "three",
          "four",
          "five",
          "six",
          "seven",
        ];
        const group =
          /\b(\d{1,2}|two|three|four|five|six|seven)\s+(?:consecutive\s+)?(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(?:mornings?|weights?|readings?)/i.exec(
            c.text,
          );
        const count = group
          ? /^\d/.test(group[1])
            ? Number(group[1])
            : words.indexOf(group[1].toLowerCase())
          : 0;
        const weekday = group
          ? [
              "Sunday",
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
            ].findIndex((d) => d.toLowerCase() === group[2].toLowerCase())
          : -1;
        const declaredDates = fields
          .filter((f) => f.path === "question")
          .flatMap((f) => mentionedDates(f.text, evidence));
        if (
          group &&
          count === points.length &&
          points.every(
            (p) => new Date(p.date + "T12:00:00Z").getUTCDay() === weekday,
          ) &&
          declaredDates.every((d) => points.some((p) => p.date === d))
        ) {
          dates = points.map((p) => p.date);
        }
      }
      const matched = dates.map((d) => points.find((p) => p.date === d));
      if (!typed || !dates.length || matched.some((p) => !p)) {
        issues.push(
          `${c.path}: An observation comparison needs supplied pre-update residuals for EVERY referenced measurement date, with the prior/same-day prediction meaning clear. Equivalent natural wording is allowed; a future endpoint or an undated guess is not.`,
        );
        continue;
      }
      deltas = matched.map((p) => p!.delta);
      observations.push(
        ...dates.map((date) => ({
          date,
          measure: c.bodyFat ? ("body_fat" as const) : ("weight" as const),
        })),
      );
    }
    const higher = /above|higher|高于|更高|上调/i.test(c.text),
      lower = /below|lower|低于|更低|下调/i.test(c.text);
    const negated =
      /\bnot\s+(?:above|below|higher|lower)|并?不(?:高于|低于|更高|更低)/i.test(
        c.text,
      );
    const agrees = (delta: number) => {
      if (higher && lower) return false;
      const relation = higher ? delta > 0 : lower ? delta < 0 : delta === 0;
      return negated ? !relation : relation;
    };
    if (deltas.some((delta) => !agrees(delta)))
      issues.push(
        `${c.path}: The stated direction does not match EVERY ${isFuture ? "common-date future projection" : "dated pre-update observation"} comparison. Do not transfer one date, measure or comparison type's direction to another.`,
      );
  }
  return {
    issues,
    observations: observations.filter(
      (v, i, all) =>
        all.findIndex((a) => a.date === v.date && a.measure === v.measure) ===
        i,
    ),
  };
}

/** Keep validation and automatically restored observation citations on the same date/type binding. */
export function checkInComparisonIssues(
  fields: Field[],
  evidence: Evidence,
): string[] {
  return bindCheckInComparisons(fields, evidence).issues;
}
