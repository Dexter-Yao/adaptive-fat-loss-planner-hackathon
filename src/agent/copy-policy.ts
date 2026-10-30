// ABOUTME: Executable scope checks shared by journey generation and measurement-progress coaching.
// ABOUTME: Clause-local negation avoids rejecting an explicit promise not to request a deferred diary.
export function measurementOnlyIssues(text: string): string[] {
  const clauses = text.split(
    /[.!?;。！？\n]|\b(?:but|however|yet|then)\b|但是|但|不过|不過|然而|然后|然後|接下来|接下來/i,
  );
  // The noun "weigh-in" names a body measurement, not an instruction to weigh food.
  const verb = String.raw`\b(?:log(?:ging)?|track(?:ing)?|record(?:ing)?|count(?:ing)?|weigh(?:ing)?(?![-\u2010-\u2015]in\b))\b`;
  const logging = new RegExp(
    `${verb}(?:(?!${verb})[^.!?;\\n]){0,35}?\\b(?:calor(?:ie|ies)|food|meals?(?![-\u2010-\u2015]prepp?ing)|intake|workouts?|exercise|portions?)\\b`,
    "gi",
  );
  const measurementReflection =
    /^(?:称重|稱重)\s*(?:之后|之後|后|後|并|並)\s*(?:仅|僅|只|先|再)?\s*(?:回顾|回顧|复盘|復盤|反思)/;
  const foodWeighingObject =
    /(?:食物秤|厨房秤|廚房秤|食物|食材|米饭|米飯|面条|麵條|餐食|份量)\s*$/;
  for (const clause of clauses) {
    const chineseVerb = String.raw`(?:记录|記錄|追踪|追蹤|跟踪|跟蹤|登记|登記|计算|計算|称量|稱量|称重|稱重|打卡)`;
    const chineseDiary = new RegExp(
      `${chineseVerb}(?:(?!${chineseVerb})[^，,。！？;\\n]){0,18}?(?:每餐|饮食|飲食|餐食|食物|卡路里|热量|熱量|摄入|攝入|运动|運動|锻炼|鍛煉|份量)`,
      "g",
    );
    for (const match of clause.matchAll(chineseDiary)) {
      const prefix = clause.slice(0, match.index);
      // A reflection after or alongside weighing is separate from the object being weighed.
      // An explicit food object/instrument still identifies food weighing; later diary verbs are checked separately.
      if (
        measurementReflection.test(match[0]) &&
        !foodWeighingObject.test(prefix)
      )
        continue;
      // Past negation must lead into a diary verb, not the word 未来 (future).
      // It can govern coordinated verbs, but not a later affirmative request.
      const pastNegation = new RegExp(
        String.raw`(?:尚未|未曾|未)(?:进行|進行)?(?:${chineseVerb}[^，,。！？;\n]*|\s*)$`,
      ).exec(prefix);
      if (
        pastNegation &&
        !/(?:并且|並且|并|並|且|或|而)\s*(?:请|請|需要|应当|應當|应该|應該|开始|開始|记得|記得)/.test(
          pastNegation[0],
        )
      )
        continue;
      if (
        /(?:不必|不用|无[需须]|無[需須]|不要|避免|不需|不需要|不想|不愿|不願|拒绝|拒絕|不要求|不强求|不強求|不做|不会|不會|而不是|而非)[^，,。！？;\n]*$|(?:不|零)\s*$/.test(
          prefix,
        )
      )
        continue;
      return [
        `Food/exercise logging is deferred; use measurement check-ins and optional notes instead. Review this clause: ${clause.trim().slice(0, 220)}`,
      ];
    }
    for (const match of clause.matchAll(logging)) {
      const prefix = clause.slice(0, match.index);
      const negation =
        /\b(?:do not|don't|does not|doesn't|did not|didn't|will not|won't|cannot|can't|without|never|avoid|no need to|not required to|not to|rather than|instead of|prefer[^.!?;\n]{0,100}\bover)\b([^.!?;\n]*)$/i.exec(
          prefix,
        );
      // A later positive instruction is a new scope, even if an earlier verb was negated.
      const positiveAfter =
        negation &&
        /\b(?:and|or)\s+(?:should|must|please|start|begin|remember|try)\b/i.test(
          negation[1],
        );
      if ((negation && !positiveAfter) || /\bno\s*$/i.test(prefix)) continue;
      return [
        `Food/exercise logging is deferred; use measurement check-ins and optional notes instead. Review this clause: ${clause.trim().slice(0, 220)}`,
      ];
    }
  }
  return [];
}

/** Conservative prototype copy control; rejects hunger-led restriction, without diagnosing its cause. */
export function practicalAdviceIssues(text: string): string[] {
  const issues = measurementOnlyIssues(text);
  for (const sentence of text.split(/[.!?。！？\n]/)) {
    const chineseHunger =
      /(?:持续饥饿|持續飢餓|一直饿|一直餓|仍然饿|仍然餓|总是饿|總是餓)/.exec(
        sentence,
      );
    if (chineseHunger) {
      const rest = sentence.slice(
        chineseHunger.index + chineseHunger[0].length,
      );
      const reduction =
        /(?:减少|減少|降低|少吃|减半|減半|跳过|跳過|不吃)[^。！？\n]{0,18}(?:主食|米饭|米飯|面条|麵條|份量|摄入|攝入|热量|熱量|一餐|早餐|午餐|晚餐)/.exec(
          rest,
        );
      if (
        reduction &&
        !/(?:不要|不应|不應|避免|别|別|不再|而非|而不是|不必|无需|無需|不需要|不能|不宜|不建议|不建議)[^，,。！？\n]{0,25}$/.test(
          sentence.slice(
            0,
            chineseHunger.index + chineseHunger[0].length + reduction.index,
          ),
        )
      )
        issues.push(
          `Persistent hunger requires a review of satisfaction, burden and assumptions; do not prescribe further portion/staple reduction or skipped food in response. Keep accepted targets unchanged. Review this clause: ${sentence.slice(0, 220)}`,
        );
    }
    const hunger =
      /\b(?:hunger\s+(?:persists|continues)|persistent\s+hunger|still\s+hungry)\b/i.exec(
        sentence,
      );
    if (!hunger) continue;
    const rest = sentence.slice(hunger.index + hunger[0].length);
    const restriction =
      /\b(?:reduce|cut|lower|shrink|skip)\b[^.!?\n]{0,60}\b(?:portions?|rice|noodles?|carb(?:ohydrate)?s?|food|meals?|intake|calories?|staples?)\b/i.exec(
        rest,
      );
    if (
      restriction &&
      !/\b(?:do not|don't|never|avoid)\s*$/i.test(
        rest.slice(0, restriction.index),
      )
    )
      issues.push(
        "Persistent hunger requires a review of satisfaction, burden and assumptions; do not prescribe further portion/staple reduction or skipped food in response. Keep accepted targets unchanged.",
      );
  }
  return issues;
}

/** Ground a plan's serving/resource claims in reported facts; no new physiological targets are introduced. */
export function journeyGroundingIssues(
  text: string,
  reportedText: string,
): string[] {
  const issues: string[] = [];
  const fixedStaple =
    /(?:一半|半碗|半份).{0,18}(?:主食|米饭|米飯|面条|麵條)|(?:主食|米饭|米飯|面条|麵條).{0,18}(?:一半|半碗|半份|减半|減半)|\b(?:half (?:the |a )?(?:rice|noodles|staple|bowl)|(?:rice|noodles|staple)[^.!?]{0,25}(?:halve|in half))\b/iu;
  for (const clause of text.split(/[.!?;。！？；\n]/u)) {
    const negative =
      /(?:不再|不要|不要求|不必|无需|無需|不用|不需|不需要|不增加|避免|without|do not|don't|never|no need|not require)[^，,。！？;；\n]{0,35}$/iu;
    const ratio = fixedStaple.exec(clause);
    if (
      ratio &&
      !fixedStaple.test(reportedText) &&
      !negative.test(clause.slice(0, ratio.index))
    )
      issues.push(
        "Do not invent a fixed half-staple/bowl rule without a user-supplied serving ratio. Keep the flexible familiar-food choice; uncertainty is not a reason to tighten portions.",
      );
    const packed =
      /自带|自帶|自备|自備|\b(?:bring (?:a |an |your )?(?:boiled egg|egg|tofu)|pack (?:a |your )?lunch)\b/iu.exec(
        clause,
      );
    if (
      packed &&
      /不愿.{0,8}备餐|不願.{0,8}備餐|不.{0,6}(?:备餐|備餐)|no.{0,20}meal.?prep|not.{0,30}meal.?prep/iu.test(
        reportedText,
      ) &&
      !/(?:可以|愿意|願意|已有|can|willing to).{0,15}(?:自带|自帶|自备|自備|bring|pack)/iu.test(
        reportedText,
      ) &&
      !negative.test(clause.slice(0, packed.index))
    )
      issues.push(
        "Declined preparation does not establish a self-packed-food supply path. Use reported ready-to-eat choices, or retain the ordinary meal and ask about unknown access at the check-in.",
      );
  }
  for (const venue of [/便利店|convenience store/iu, /超市|supermarket/iu]) {
    if (
      venue.test(text) &&
      !venue.test(reportedText) &&
      !/(?:如果|若|如).{0,12}(?:有|提供|可买|可以买|買得到).{0,12}(?:便利店|超市)|(?:便利店|超市).{0,12}(?:是否|若有|如有)|if (?:a |the )?(?:convenience store|supermarket) (?:is available|exists)/iu.test(
        text,
      )
    )
      issues.push(
        "A fallback introduces an unreported convenience store/supermarket and supply path. Retain the ordinary meal and ask what is available; do not assign a new venue as though access were confirmed.",
      );
  }
  const holiday =
    /节假日|節假日|春节|春節|元旦|\bholiday|\bChristmas|\bNew Year/iu;
  if (holiday.test(text) && !holiday.test(reportedText))
    issues.push(
      "Calendar dates do not establish this user's holiday participation or gatherings. Replace holiday-specific phase purposes/questions with ordinary fit, access and continuation review.",
    );
  return issues;
}
