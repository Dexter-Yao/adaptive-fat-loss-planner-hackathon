// ABOUTME: Bounded source review → deterministic calculation → structured presentation, shared by providers.
// ABOUTME: The Agent proposes action edits; it cannot mutate records, accepted targets or checked history.
import { z } from "zod";
import {
  CoachRequestSchema,
  CoachResultSchema,
  ContextAssessmentSchema,
  PlanPresentationSchema,
  fourWeekStarts,
  weekDates,
  dateInZone,
  endpoint,
  type CoachInput,
  type CoachResult,
  type ContextAssessment,
  type PlanPresentation,
} from "../domain/contracts";
import {
  enforceContext,
  getContextSources,
  explanationIssues,
} from "../domain/context";
import { evaluatePlanning, type PlanningOutcome } from "../planning/evaluate";
import { presentationIssues } from "./validation";
import { COACH_INSTRUCTIONS } from "./prompt";

export interface BusinessTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
export type ToolHandler = (
  name: string,
  args: unknown,
) => Promise<Record<string, unknown>>;
export type ProviderObserver = (event: {
  kind: "assistant_text" | "usage" | "turn" | "configuration" | "tool_payload";
  value: unknown;
}) => void;
export interface AgentProvider {
  name: "codex" | "nebius";
  model: string;
  run(
    instructions: string,
    context: string,
    tools: BusinessTool[],
    handle: ToolHandler,
    signal: AbortSignal,
    observer?: ProviderObserver,
  ): Promise<void>;
}
const ForecastArgs = z.object({}).strict();
function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _dialect, ...result } = z.toJSONSchema(schema);
  return result;
}
export const BUSINESS_TOOLS: BusinessTool[] = [
  {
    name: "review_context",
    description:
      "Read all authoritative sources. Extract constraints and applicability signals with exact sourceId/quote evidence before calculating. Do not infer completed eating or exercise from an action check.",
    inputSchema: jsonSchema(ContextAssessmentSchema),
  },
  {
    name: "forecast",
    description:
      "Evaluate user facts, accepted target history and current constraints. Takes {} only; may pause numerical planning. Returns authoritative scenarios, review, and required missing calendar weeks.",
    inputSchema: jsonSchema(ForecastArgs),
  },
  {
    name: "present_plan",
    description:
      "Submit an explanation, complete newWeeks for the requested missing weeks, and optional explicit actionChanges. Existing action edits are suggestions awaiting user confirmation. Numerical targets belong to the calculator.",
    inputSchema: jsonSchema(PlanPresentationSchema),
  },
];
export async function runCoach(
  raw: CoachInput,
  provider: AgentProvider,
  onTool: (name: string) => void = () => {},
  externalSignal?: AbortSignal,
): Promise<CoachResult> {
  const request = CoachRequestSchema.parse(raw);
  const asOfDate = request.asOfDate ?? dateInZone(request.profile.timezone);
  const requiredWeeks = (
    request.action === "explain" ? [] : fourWeekStarts(asOfDate)
  ).filter(
    (date) => !request.weeklyPlans.some((week) => week.weekStart === date),
  );
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, AbortSignal.timeout(120_000)])
    : AbortSignal.timeout(120_000);
  let context: ContextAssessment | null = null,
    outcome: PlanningOutcome | null = null,
    presentation: PlanPresentation | null = null;
  const calls: string[] = [];
  const handle: ToolHandler = async (name, args) => {
    if (signal.aborted) throw new Error("The request was cancelled.");
    calls.push(name);
    if (calls.length > 8)
      throw new Error("The agent exceeded this turn's tool budget.");
    onTool(name);
    if (name === "review_context") {
      context = null;
      outcome = null;
      presentation = null;
      try {
        context = enforceContext(request, ContextAssessmentSchema.parse(args));
        return { status: "ok", context };
      } catch (error) {
        return {
          status: "rejected",
          error:
            error instanceof Error
              ? error.message
              : "Cite exact supplied source text.",
        };
      }
    }
    if (name === "forecast") {
      outcome = null;
      presentation = null;
      if (!context)
        return {
          status: "rejected",
          error: "Call review_context with source-backed evidence first.",
        };
      if (!ForecastArgs.safeParse(args).success)
        return {
          status: "rejected",
          error:
            "forecast accepts an empty object only. User facts and target revisions own all numerical inputs.",
        };
      try {
        outcome = evaluatePlanning(request, context);
        const f = outcome.forecast;
        const numeric = f
          ? {
              inputHash: f.inputHash,
              asOfDate: f.asOfDate,
              baseline: f.baseline,
              targetDate: f.targetDate,
              projectionDate: f.projectionDate,
              coverage: f.coverage,
              assumptions: f.assumptions,
            }
          : null;
        const scenarioOutcomes = f
          ? {
              followingAcceptedTargets: {
                endpoint: endpoint(f, "accepted"),
                withinGoal: f.goalOutcomes.accepted,
                assumption: "Follow accepted targets after today.",
              },
              continuingLoggedPattern: {
                endpoint: endpoint(f, "current"),
                withinGoal: f.goalOutcomes.current,
                assumption:
                  "Continue the seven-day pattern, including explicitly labelled missing-meal assumptions. Not proof of adherence.",
              },
              proposalPreviewAssumption: outcome.decision.proposal
                ? "Follow proposed targets from the proposed effective date."
                : null,
            }
          : null;
        return {
          status: "ok",
          forecast: numeric,
          scenarioOutcomes,
          decision: outcome.decision,
          targetRevisions: outcome.targetRevisions,
          context,
          requiredNewWeeks: f ? requiredWeeks : [],
          requiredCalendarWeeks: f
            ? requiredWeeks.map((weekStart) => ({
                weekStart,
                remainingDates: weekDates(weekStart).filter(
                  (date) => date >= asOfDate,
                ),
              }))
            : [],
          earliestActionDate: asOfDate,
          existingWeeklyPlans: request.weeklyPlans,
          actionRules:
            "Do not fabricate past arrangements. Existing content, dates and checks are user-owned; propose changes by ID. Retain checked and past occurrences. No action check or arrangement is an energy-balance observation.",
        };
      } catch (error) {
        return {
          status: "rejected",
          error:
            error instanceof Error ? error.message : "Forecast unavailable.",
        };
      }
    }
    if (name === "present_plan") {
      presentation = null;
      if (!outcome || !context)
        return {
          status: "rejected",
          error:
            "Read a successful forecast decision first, including when numerical planning is paused.",
        };
      const parsed = PlanPresentationSchema.safeParse(args);
      if (!parsed.success)
        return {
          status: "rejected",
          error: "Presentation did not match the schema.",
          issues: parsed.error.issues.map(
            (issue) => issue.path.join(".") + ": " + issue.message,
          ),
        };
      const candidate = parsed.data;
      const actions = [
        ...candidate.newWeeks.flatMap((week) => [
          { kind: "recording", title: week.focus, details: "" },
          ...week.actions,
        ]),
        ...candidate.actionChanges.flatMap((change) =>
          change.replacement ? [change.replacement] : [],
        ),
      ];
      const issues = [
        ...presentationIssues(
          candidate,
          request,
          outcome.forecast !== null,
          asOfDate,
        ),
        ...explanationIssues(
          {
            ...candidate.explanation,
            changes: [
              ...candidate.explanation.changes,
              ...candidate.actionChanges.map((change) => change.reason),
            ],
          },
          context,
          outcome.decision,
          outcome.forecast,
          actions,
        ),
      ];
      if (issues.length)
        return {
          status: "rejected",
          error:
            "Presentation contradicts authoritative facts, action ownership or constraints. Correct the listed issues.",
          issues,
        };
      presentation = candidate;
      return { status: "ok", message: "Presentation received. Finish now." };
    }
    throw new Error("The agent requested an unregistered application tool.");
  };
  await provider.run(
    COACH_INSTRUCTIONS,
    JSON.stringify({
      action: request.action,
      asOfDate,
      profile: request.profile,
      goal: request.goal,
      preferences: request.preferences,
      contextSources: getContextSources(request),
      recentDailyEntries: [...request.logs]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-14),
      targetRevisions: request.targetRevisions,
      weeklyPlans: request.weeklyPlans,
      missingWeekStarts: requiredWeeks,
      previousNumbers: request.previousNumbers,
      previousExplanation: request.previousExplanation,
    }),
    BUSINESS_TOOLS,
    handle,
    signal,
  );
  const completed = outcome as PlanningOutcome | null,
    ready = presentation as PlanPresentation | null;
  if (!ready || !completed || !context)
    throw new Error(
      "The agent did not complete an assessed plan. Your saved records have been kept; retry the analysis.",
    );
  return CoachResultSchema.parse({
    ...ready,
    ...completed,
    context,
    asOfDate,
    sessionId: request.sessionId,
    sourceRevision: request.sourceRevision,
    actionsRevision: request.actionsRevision,
    provider: provider.name,
    model: provider.model,
    toolCalls: calls,
  });
}
