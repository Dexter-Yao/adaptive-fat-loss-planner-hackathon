// ABOUTME: One guard against agent prose becoming a second owner of numerical health targets.
// ABOUTME: Structured calculator values and time-budget fields are rendered separately by the application.
export function numericalProseIssues(text: string): string[] {
  const issues: string[] = [];
  const quantity = String.raw`(?:\d(?:[\d,.]*\d)?|[零〇一二两兩三四五六七八九十百千万萬]+)`;
  if (
    new RegExp(
      `${quantity}\\s*(?:卡路里|大卡|千卡|公斤|千克|斤|磅)|(?:蛋白质|蛋白質)[^。！？\\n]{0,20}${quantity}\\s*克`,
      "u",
    ).test(text)
  )
    issues.push(
      "Numerical calorie, weight, and protein targets belong to the deterministic display, not agent prose.",
    );
  if (
    /\d(?:[\d,.]*\d)?\s*(?:kcal|calories|kilocalories|kg|kilograms?|lbs?|pounds?|千卡|大卡|公斤|千克|磅)\b|\d(?:[\d,.]*\d)?\s*(?:千卡|大卡|公斤|千克|磅)|(?:protein|蛋白质|蛋白質)[^.!?。！？\n]{0,25}\d+(?:\.\d+)?\s*(?:g\b|grams?\b|克)|\d+(?:\.\d+)?\s*(?:g\b|grams?\b|克)\s*(?:of\s+)?(?:protein|蛋白质|蛋白質)/iu.test(
      text,
    )
  )
    issues.push(
      "Numerical calorie, weight, and protein targets belong to the deterministic display, not agent prose.",
    );
  if (
    /(?:body[- ]?fat|体脂|體脂)[^.!?。！？\n]{0,35}\d+(?:\.\d+)?\s*[%％]|\d+(?:\.\d+)?\s*[%％][^.!?。！？\n]{0,20}(?:body[- ]?fat|体脂|體脂)|(?:体脂|體脂)[^。！？\n]{0,15}百分之|(?:活动系数|活動係數)[^。！？\n]{0,10}\d|\bPAL\s*(?:of|is|=|:)?\s*\d/iu.test(
      text,
    )
  )
    issues.push(
      "Numerical body-fat and PAL values belong to the deterministic display, not Agent prose.",
    );
  return [...new Set(issues)];
}
