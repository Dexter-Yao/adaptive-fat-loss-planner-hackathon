// ABOUTME: Source-backed context guards for the adult planning demo and its agent-authored copy.
// ABOUTME: Canonical text owns constraints; these narrow fallbacks are not diagnoses or a clinical classifier.
import {
  ContextAssessmentSchema,
  type CoachRequest,
  type ContextAssessment,
  type ContextSource,
  type Decision,
  type ForecastSnapshot,
  type CoachExplanation,
} from "./contracts";
import { numericalProseIssues } from "./numeric-copy";
import { assessPlanningEligibility } from "./planning-eligibility";

type Constraint = ContextAssessment["constraints"][number];
type Signal = ContextAssessment["signals"][number];
type Evidence = Constraint["evidence"][number];
type Food = { name: string; aliases: string[]; includes?: string[] };

const FOODS: Food[] = [
  {
    name: "seafood",
    aliases: ["seafood", "海鲜", "海鮮", "海产品", "海產品"],
    includes: ["fish", "shellfish"],
  },
  {
    name: "shellfish",
    aliases: [
      "shellfish",
      "shrimp",
      "shrimps",
      "prawn",
      "prawns",
      "crab",
      "lobster",
      "mussel",
      "mussels",
      "clam",
      "clams",
      "oyster",
      "oysters",
      "scallop",
      "scallops",
      "贝类",
      "貝類",
      "甲壳类",
      "甲殼類",
      "虾",
      "蝦",
      "蟹",
    ],
  },
  {
    name: "fish",
    aliases: [
      "fish",
      "salmon",
      "tuna",
      "cod",
      "sardine",
      "sardines",
      "trout",
      "haddock",
      "鱼",
      "魚",
      "三文鱼",
      "鲑鱼",
      "金枪鱼",
      "鳕鱼",
    ],
  },
  {
    name: "peanut",
    aliases: ["peanut", "peanuts", "groundnut", "groundnuts", "花生"],
  },
  {
    name: "milk",
    aliases: [
      "milk",
      "dairy",
      "lactose",
      "yogurt",
      "yoghurt",
      "cheese",
      "butter",
      "cream",
      "whey",
      "牛奶",
      "乳制品",
      "奶制品",
      "乳糖",
      "酸奶",
      "奶酪",
      "乳清",
    ],
  },
  { name: "egg", aliases: ["egg", "eggs", "鸡蛋", "雞蛋", "蛋类", "禽蛋"] },
  {
    name: "gluten",
    aliases: [
      "gluten",
      "wheat",
      "barley",
      "rye",
      "麸质",
      "麩質",
      "小麦",
      "小麥",
      "大麦",
      "黑麦",
    ],
  },
  {
    name: "soy",
    aliases: [
      "soy",
      "soya",
      "soybean",
      "soybeans",
      "tofu",
      "大豆",
      "黄豆",
      "豆腐",
    ],
  },
  {
    name: "tree nuts",
    aliases: [
      "tree nuts",
      "almond",
      "almonds",
      "walnut",
      "walnuts",
      "cashew",
      "cashews",
      "hazelnut",
      "hazelnuts",
      "杏仁",
      "核桃",
      "腰果",
      "榛子",
    ],
  },
];

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function aliasPattern(alias: string): string {
  return /^[a-z ]+$/i.test(alias) ? `\\b${escape(alias)}\\b` : escape(alias);
}
function foodPattern(food: Food): RegExp {
  return new RegExp(food.aliases.map(aliasPattern).join("|"), "giu");
}
function mentionsFood(text: string, food: Food): boolean {
  return foodPattern(food).test(text);
}
function clauses(text: string): string[] {
  return text
    .split(
      /(?<=[.!?。！？;；\n])|\b(?:but|however)\b|但是|不过|但(?=我|喜欢|喜歡)|\band\s+(?=I\b|my\b|enjoy\b|like\b|love\b)|[,，](?=\s*(?:but|however|I\b|my\b|但是|但我|不过))/iu,
    )
    .map((s) => s.trim())
    .filter(Boolean);
}
function isThirdPerson(text: string): boolean {
  return /\b(?:my|our)\s+(?:sister|brother|wife|husband|partner|mother|father|friend|child|son|daughter|baby|patient)\b|\b(?:she|he|they)\s+(?:is|are|has|have)\b|(?:我|我们|我們)(?:的)?(?:姐姐|妹妹|哥哥|弟弟|妻子|丈夫|朋友|孩子|宝宝|女儿|儿子|妈妈|爸爸)/iu.test(
    text,
  );
}
function isFirstPerson(text: string): boolean {
  return (
    /\b(?:I|I['’]m|I['’]ve|my|me)\b|我/iu.test(text) && !isThirdPerson(text)
  );
}
function hasExclusion(text: string): boolean {
  if (
    /\b(?:not|never)\s+allergic|\bno\s+(?:[a-z]+\s+){0,2}allerg(?:y|ies)|\b(?:do\s+not|don['’]t|never)\s+have\s+(?:[a-z]+\s+){0,3}allerg(?:y|ies)|没有.{0,12}过敏|沒有.{0,12}過敏|不过敏|不過敏|不再.{0,10}过敏/iu.test(
      text,
    )
  )
    return false;
  return /\b(?:allerg\w*|intoleran\w*|avoid|exclude|excluding|without|free[- ]of|no|cannot\s+(?:eat|have|tolerate)|can['’]t\s+(?:eat|have|tolerate)|don['’]t\s+(?:eat|have)|do\s+not\s+(?:eat|have)|never\s+eat|react\s+to|reaction\s+to)\b|\b(?:egg|dairy|gluten|peanut|nut|wheat)[- ]free\b|不吃|不能吃|不食|忌口|禁食|避免|过敏|過敏|不耐受/iu.test(
    text,
  );
}
function isAllergy(text: string): boolean {
  return /allerg|intoleran|reaction|react\s+to|过敏|過敏|不耐受/iu.test(text);
}

function explicitExpiry(
  text: string,
  sourceDate: string | null,
): string | null {
  const dated = text.match(
    /(?:until|through|ends?\s+(?:on)?|截至|直到|到)\s*(\d{4}-\d{2}-\d{2})/iu,
  );
  if (dated) return dated[1];
  if (
    sourceDate &&
    /\b(?:today\s+only|only\s+today|for\s+today)\b|仅今天|仅限今天|只在今天|只限今天/u.test(
      text,
    )
  )
    return sourceDate;
  return null;
}
function evidence(source: ContextSource, text: string, focus = 0): Evidence {
  const start = Math.max(0, Math.min(focus - 180, text.length - 400));
  return { sourceId: source.id, quote: text.slice(start, start + 400) };
}

/** Return all authoritative text, including older notes whose ongoing constraints still apply. */
export function getContextSources(request: CoachRequest): ContextSource[] {
  return [
    {
      id: "profile.preferences",
      text: request.preferences.foodPreferences,
      date: null,
    },
    { id: "profile.context", text: request.preferences.context, date: null },
    {
      id: "profile.eligibility",
      text: request.profile.eligibility,
      date: null,
    },
    {
      id: "profile.ageYears",
      text: String(request.profile.ageYears),
      date: null,
    },
    ...request.logs
      .filter((log) => log.notes.trim())
      .map((log) => ({
        id: `log:${log.date}`,
        text: log.notes,
        date: log.date,
      })),
  ];
}

function deriveFallback(
  sources: ContextSource[],
  asOf: string,
): { constraints: Constraint[]; signals: Signal[] } {
  const constraints: Constraint[] = [],
    signals: Signal[] = [];
  for (const source of sources) {
    if (source.id === "profile.ageYears") {
      const result = assessPlanningEligibility({
        ageYears: Number(source.text),
        eligibility: "standard",
      });
      if (!result.supported)
        signals.push({
          kind: "unsupported",
          label: result.reasons[0],
          evidence: [evidence(source, source.text)],
        });
      continue;
    }
    if (source.id === "profile.eligibility") {
      if (source.text !== "standard")
        signals.push({
          kind: "unsupported",
          label:
            "The selected eligibility requires guidance outside this adult demo.",
          evidence: [evidence(source, source.text)],
        });
      continue;
    }
    for (const clause of clauses(source.text)) {
      const untilDate = explicitExpiry(clause, source.date);
      const expired = untilDate !== null && untilDate < asOf;
      if (!isThirdPerson(clause) && !expired && hasExclusion(clause)) {
        for (const food of FOODS.filter((food) => mentionsFood(clause, food))) {
          constraints.push({
            kind: isAllergy(clause) ? "allergy" : "food_exclusion",
            label: food.name,
            scope: untilDate ? "temporary" : "ongoing",
            untilDate,
            evidence: [
              evidence(source, clause, clause.search(foodPattern(food))),
            ],
          });
        }
      }
      if (!isFirstPerson(clause)) continue;
      if (
        /\b(?:pregnant|breastfeed|breastfeeding|breast[- ]feeding|nursing\s+(?:a|my)\s+(?:baby|child))\b|怀孕|懷孕|哺乳/iu.test(
          clause,
        ) &&
        !/\b(?:not|never|no\s+longer)\s+(?:(?:currently|now|at\s+all)\s+)?(?:pregnant|breastfeed|breastfeeding|breast[- ]feeding)|没有怀孕|沒有懷孕|未怀孕|未懷孕|没怀孕|沒懷孕|不是孕妇|不在哺乳|没有哺乳|未哺乳/iu.test(
          clause,
        )
      ) {
        signals.push({
          kind: "unsupported",
          label:
            "Pregnancy or breastfeeding needs guidance outside this adult demo.",
          evidence: [evidence(source, clause)],
        });
      }
      if (
        /\b(?:fainted|fainting|passed\s+out|chest\s+pain|repeated(?:ly)?\s+(?:dizzy|dizziness)|(?:dizzy|dizziness)\s+(?:again|every\s+day|repeatedly)|keep\s+(?:getting|feeling)\s+dizzy)\b|晕厥|暈厥|昏倒|昏厥|胸痛|胸口痛|反复头晕|反覆頭暈|持续头晕|经常头晕|一直头晕/iu.test(
          clause,
        ) &&
        !/\b(?:no|not|never|without)\s+(?:(?:any|having|experienced)\s+)?(?:fainting|fainted|chest\s+pain|dizziness)|\b(?:haven['’]t|have\s+not|did\s+not)\s+(?:fainted|faint|experienced)|没有.{0,4}(?:胸痛|晕厥|头晕)|沒有.{0,4}(?:胸痛|暈厥|頭暈)/iu.test(
          clause,
        )
      ) {
        signals.push({
          kind: "urgent_symptom",
          label:
            "A reported concerning symptom needs prompt professional assessment before weight-loss planning.",
          evidence: [evidence(source, clause)],
        });
      }
      if (
        !expired &&
        /\b(?:hungry|hunger|fatigued|fatigue|exhausted|cannot\s+(?:sustain|keep\s+up|stick)|can['’]t\s+(?:sustain|keep\s+up|stick)|unsustainable)\b|很饿|好饿|饥饿|飢餓|疲劳|疲勞|太累|无法坚持|無法堅持|坚持不下去|撐不下去/iu.test(
          clause,
        ) &&
        !/\b(?:not|never|no\s+longer)\s+(?:hungry|fatigued|exhausted)|\bno\s+(?:hunger|fatigue)|不饿|不餓|没有疲劳|沒有疲勞/iu.test(
          clause,
        )
      ) {
        signals.push({
          kind: "low_feasibility",
          label:
            "The reported hunger, fatigue, or difficulty sustaining the plan warrants a feasibility review.",
          evidence: [evidence(source, clause)],
        });
      }
    }
  }
  return { constraints, signals };
}

function checkedEvidence(
  items: Evidence[],
  sources: Map<string, ContextSource>,
): void {
  for (const item of items) {
    const source = sources.get(item.sourceId);
    if (!item.quote.trim() || !source || !source.text.includes(item.quote))
      throw new Error(
        `Context evidence does not match authoritative source: ${item.sourceId}`,
      );
  }
}
function candidateConstraint(
  constraint: Constraint,
  sources: Map<string, ContextSource>,
  asOf: string,
): Constraint | null {
  checkedEvidence(constraint.evidence, sources);
  if (constraint.kind !== "practical") {
    for (const food of FOODS.filter((item) =>
      mentionsFood(constraint.label, item),
    )) {
      const relevant = constraint.evidence.filter((item) =>
        mentionsFood(item.quote, food),
      );
      if (
        relevant.length &&
        relevant.every(
          (item) =>
            !hasExclusion(item.quote) &&
            /\b(?:enjoy|like|love|not\s+allergic|no\s+allergies)\b|喜欢|喜歡|没有.{0,12}过敏|不过敏/iu.test(
              item.quote,
            ),
        )
      )
        throw new Error("A food constraint contradicts its cited source.");
    }
  }
  const expiries = constraint.evidence.flatMap((item) => {
    const source = sources.get(item.sourceId)!;
    const relevant =
      clauses(source.text).find((part) => part.includes(item.quote)) ??
      item.quote;
    const expiry = explicitExpiry(relevant, source.date);
    return expiry ? [expiry] : [];
  });
  const untilDate = expiries.sort()[0] ?? constraint.untilDate;
  const scope = expiries.length ? "temporary" : constraint.scope;
  if (scope === "temporary" && untilDate !== null && untilDate < asOf)
    return null;
  return {
    ...constraint,
    scope,
    untilDate: scope === "ongoing" ? null : untilDate,
  };
}
function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = key(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Rebuild source-backed context; prior output is never an independent memory or numeric planning input. */
export function enforceContext(
  request: CoachRequest,
  candidate?: ContextAssessment,
): ContextAssessment {
  const sources = getContextSources(request),
    sourceMap = new Map(sources.map((source) => [source.id, source]));
  const asOf = request.asOfDate ?? new Date().toISOString().slice(0, 10);
  const fallback = deriveFallback(sources, asOf);
  const assessed = candidate ? ContextAssessmentSchema.parse(candidate) : null;
  const proposedConstraints =
    assessed?.constraints
      .map((item) => candidateConstraint(item, sourceMap, asOf))
      .filter((item): item is Constraint => item !== null) ?? [];
  for (const signal of assessed?.signals ?? [])
    checkedEvidence(signal.evidence, sourceMap);
  if (
    assessed?.applicability === "unsupported" &&
    !assessed.signals.some((signal) => signal.kind === "unsupported")
  )
    throw new Error(
      "Unsupported context requires a source-backed unsupported signal.",
    );
  if (
    assessed?.applicability === "needs_confirmation" &&
    !assessed.signals.length
  )
    throw new Error(
      "Context requiring confirmation needs a source-backed signal.",
    );
  const merged = new Map<string, Constraint>();
  for (const item of [...fallback.constraints, ...proposedConstraints]) {
    const known = FOODS.find((food) => mentionsFood(item.label, food));
    const identity = `${item.kind}:${known?.name ?? item.label.toLowerCase()}:${item.scope}:${item.untilDate ?? ""}`;
    const previous = merged.get(identity);
    merged.set(
      identity,
      previous
        ? {
            ...previous,
            evidence: unique(
              [...previous.evidence, ...item.evidence],
              (e) => `${e.sourceId}:${e.quote}`,
            ).slice(0, 3),
          }
        : item,
    );
  }
  const constraints = [...merged.values()]
    .sort((a, b) => Number(b.kind === "allergy") - Number(a.kind === "allergy"))
    .slice(0, 20);
  const signals = unique(
    [...fallback.signals, ...(assessed?.signals ?? [])],
    (item) => `${item.kind}:${item.label}`,
  ).slice(0, 10);
  const unsupported = signals.some((signal) => signal.kind === "unsupported");
  const urgent = signals.some((signal) => signal.kind === "urgent_symptom");
  return ContextAssessmentSchema.parse({
    applicability: unsupported
      ? "unsupported"
      : urgent
        ? "needs_confirmation"
        : (assessed?.applicability ?? "standard"),
    reason: unsupported
      ? "The supplied context is outside this adult weight-loss demo; seek suitable professional guidance."
      : urgent
        ? "Pause weight-loss planning and seek prompt professional assessment of the reported symptom."
        : (assessed?.reason ?? null),
    constraints,
    signals,
  });
}

function isNegativeAdvice(text: string): boolean {
  return /\b(?:avoid|without|no|not|never|skip|stop|pause|exclude|excluding|free\s+of|don['’]t|do\s+not|cannot|can['’]t)\b|[- ]free\b|避免|不吃|不能|不要|暂停|暫停|停止|不建议|不建議|无|無/iu.test(
    text,
  );
}
function excludedFoods(context: ContextAssessment): Food[] {
  const found = FOODS.filter((food) =>
    context.constraints.some(
      (constraint) =>
        constraint.kind !== "practical" && mentionsFood(constraint.label, food),
    ),
  );
  const included = new Set(
    found.flatMap((food) => [food.name, ...(food.includes ?? [])]),
  );
  return FOODS.filter((food) => included.has(food.name));
}
function foodAdviceIssues(
  text: string,
  foods: Food[],
  isNutrition = false,
): string[] {
  // Normalize typography only inside the copy check; raw source quotations and facts stay exact.
  text = text.replace(/[\u2010-\u2015\u2212]/gu, "-");
  const issues: string[] = [];
  for (const food of foods) {
    for (const match of text.matchAll(foodPattern(food))) {
      const index = match.index!;
      const before =
        text
          .slice(0, index)
          .split(/[.!?。！？;；\n,，]/u)
          .at(-1) ?? "";
      const after = text
        .slice(index + match[0].length)
        .split(/[.!?。！？;；\n,，]/u)[0];
      const localBefore = before.slice(-45);
      if (
        isNegativeAdvice(localBefore) ||
        /\bavoid(?:s|ing|ed)?\s*$/iu.test(localBefore) ||
        /\bnon[- ]$/iu.test(localBefore) ||
        /^[- ]aware\b|^\s+ingredient\s+checks\b|^\s+(?:ingredients?\s+)?(?:(?:are|were|must\s+be)\s+)?(?:absent|avoided|excluded)\b/iu.test(
          after,
        ) ||
        /^\s*[- ]free\b|^\s*(?:(?:is|are)\s+)?(?:excluded|avoided|not\s+allowed|unsafe)|^\s*(?:allergy|intolerance|exclusion|restriction|avoidance)\b/iu.test(
          after,
        ) ||
        /^(?:除外|不吃|不能吃|过敏|過敏)/u.test(after)
      )
        continue;
      if (
        isNutrition ||
        /\b(?:eat|add|try|choose|pick|order|cook|prepare|include|have|use|enjoy|recommend|serve|breakfast|lunch|dinner|snack|meal)\b|吃|食用|加入|选择|選擇|推荐|推薦|早餐|午餐|晚餐|加餐/iu.test(
          before,
        ) ||
        /\b(?:with|for\s+protein)\b|搭配|补充蛋白/u.test(after)
      )
        issues.push(`Copy recommends excluded ${food.name}.`);
    }
  }
  return issues;
}

/** Reject obvious contradictions while leaving all numerical targets to deterministic UI facts. */
export function explanationIssues(
  copy: CoachExplanation,
  context: ContextAssessment,
  decision: Decision,
  forecast?: ForecastSnapshot | null,
  actions: { kind: string; title: string; details: string }[] = [],
): string[] {
  const fields = [
    copy.headline,
    copy.summary,
    ...actions.flatMap((action) => [action.title, action.details]),
    ...copy.changes,
    copy.question ?? "",
    copy.whyForecast,
  ];
  const text = fields.join("\n"),
    issues: string[] = [];
  issues.push(...numericalProseIssues(text));
  for (const sentence of clauses(text)) {
    if (
      /\b(?:guarantee\w*|definitely|certainly|will\s+(?:reach|achieve|lose)|you['’]ll\s+(?:reach|achieve|lose))\b|保证.{0,15}(?:减|瘦|达|達)|(?<!不)一定(?:可以|能够|能夠|能|会|會)?\s*(?:减|瘦|达|達)/iu.test(
        sentence,
      ) &&
      !/\b(?:cannot|can['’]t|no|not|never|don['’]t|do\s+not)\b|不能保证|無法保證|无法保证|不保证|不保證|不承诺|不承諾/iu.test(
        sentence,
      )
    )
      issues.push(
        `Copy must not guarantee weight-loss outcomes. Review this clause: ${sentence.slice(0, 220)}`,
      );
    if (
      /(?:learned|learnt|measured|calibrated|identified|discovered|adapted\s+to).{0,45}(?:your|personal|individual).{0,20}metabolis|(?:学会|学到|测出|校准|掌握|学习).{0,12}(?:你|个人|個人).{0,8}代谢/iu.test(
        sentence,
      ) &&
      !/\b(?:not|never|hasn['’]t|haven['’]t|cannot|can['’]t)\b|没有|沒有|尚未|不能|无法/u.test(
        sentence,
      )
    )
      issues.push(
        "Copy must not claim to have learned or measured personal metabolism.",
      );
    if (
      (decision.status === "paused" ||
        decision.status === "needs_confirmation") &&
      !isNegativeAdvice(sentence) &&
      /\b(?:calorie\s+deficit|eat\s+less|cut\s+(?:your\s+)?(?:food|calories|carbs|meals)|reduce\s+(?:your\s+)?(?:food|intake|calories)|restrict\s+(?:food|intake|calories)|skip\s+meals|lose\s+weight|weight[- ]loss\s+(?:exercise|workout)|(?:increase|add|continue|start|keep).{0,25}(?:cardio|running|runs|workouts|training)|(?:run|walk|cycle|exercise).{0,30}(?:burn|lose))\b|热量缺口|热量赤字|减少进食|减少热量|少吃|减重运动|减脂运动|增加.{0,6}(?:跑步|运动|訓練|训练)/iu.test(
        sentence,
      )
    )
      issues.push(
        "Weight-loss guidance is not allowed while planning is paused or requires confirmation.",
      );
  }
  const foods = excludedFoods(context);
  for (const field of fields)
    issues.push(
      ...foodAdviceIssues(
        field,
        foods,
        actions.some(
          (action) =>
            action.kind === "nutrition" &&
            (action.title === field || action.details === field),
        ),
      ),
    );
  // "Accepted" can describe the existing target. Only a change predicate connected
  // to numerical plan ownership is an applied revision; practical advice may update.
  const appliedChange =
    /\b(?:changed|updated|reduced|increased|extended|moved|lowered|raised)\b.{0,35}\b(?:calories|calorie\s+target|intake|target\s+date|deadline|timeline|(?:accepted|numerical|calorie)\s+plan)\b|\b(?:calories|calorie\s+target|intake|target\s+date|deadline|timeline|(?:accepted|numerical|calorie)\s+plan)\b.{0,35}\b(?:changed|updated|reduced|increased|extended|moved|lowered|raised)\b|\b(?:I|we|you)\s+(?:have\s+)?accepted\b.{0,35}\b(?:calories|calorie\s+target|target\s+date|deadline|timeline|proposal)\b|已(?:调整|更新|降低|增加|延长).{0,8}(?:热量|目标日期|期限|数值计划)/iu;
  const hypothetical =
    /\b(?:not|no|pending|proposed|if|would|could|once|after\s+you|accept\s+to)\b|尚未|未接受|待确认|建议|如果/iu;
  const claimsAppliedChange = copy.changes.some(
    (line) => appliedChange.test(line) && !hypothetical.test(line),
  );
  if (claimsAppliedChange && decision.proposal)
    issues.push(
      "Copy must not describe a pending proposal as an applied plan change.",
    );
  if (
    claimsAppliedChange &&
    !decision.proposal &&
    !/accepted|applied/iu.test(decision.code) &&
    !decision.facts.some(
      (fact) => appliedChange.test(fact) && !hypothetical.test(fact),
    )
  )
    issues.push(
      "Copy must not invent an applied plan revision absent from deterministic facts.",
    );
  if (
    /\b(?:no\s+(?:plan\s+)?change|unchanged|kept?\s+(?:the\s+)?(?:plan|calories|target).{0,12}(?:steady|same)|keep\s+(?:the\s+)?plan\s+steady)\b|没有变化|保持原计划/iu.test(
      text,
    ) &&
    decision.facts.some(
      (fact) => appliedChange.test(fact) && !hypothetical.test(fact),
    )
  )
    issues.push(
      "Copy claims an unchanged plan although deterministic facts record a change.",
    );
  for (const sentence of clauses(text)) {
    const positiveOutcome =
      /\b(?:within|reach(?:es)?|meet(?:s)?|on\s+track|achiev\w*|attain\w*)\b.{0,65}\b(?:goal|target|timeline)\b/iu.test(
        sentence,
      );
    const negativeOutcome =
      /\b(?:not|no|cannot|can['’]t|doesn['’]t|miss\w*|above|outside|unlikely)\b/iu.test(
        sentence,
      );
    if (
      positiveOutcome &&
      !negativeOutcome &&
      /\b(?:logged|recent|recorded)[- ](?:intake|pattern|scenario)\b/iu.test(
        sentence,
      ) &&
      forecast &&
      !forecast.goalOutcomes.current
    )
      issues.push(
        "The logged-pattern scenario does not meet the goal. Do not confuse it with the accepted-plan projection or proposal preview.",
      );
    if (
      positiveOutcome &&
      !negativeOutcome &&
      /\b(?:accepted|current|following)[- ](?:plan|target)\b/iu.test(
        sentence,
      ) &&
      forecast &&
      !forecast.goalOutcomes.accepted
    )
      issues.push(
        "The accepted-plan projection does not meet the goal date. Do not claim it is on track.",
      );
  }
  return [...new Set(issues)];
}

/** Check an existing arrangement against the current, source-backed food restrictions. */
export function actionAdviceIssues(
  action: { kind: string; title: string; details: string },
  context: ContextAssessment,
): string[] {
  const foods = excludedFoods(context);
  return [
    ...new Set(
      [action.title, action.details].flatMap((text) =>
        foodAdviceIssues(text, foods, action.kind === "nutrition"),
      ),
    ),
  ];
}
