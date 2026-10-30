// ABOUTME: Offline comparison derives operational evidence from actual stage receipts, never invented quality scores.
// ABOUTME: Exact input matches and system differences stay visible; unknown usage is never zero cost.
import { z } from "zod";
const Usage = z.object({
  input_tokens: z.number().nonnegative(),
  output_tokens: z.number().nonnegative(),
  total_tokens: z.number().nonnegative(),
});
const Summary = z
  .object({
    stage: z.string(),
    operation: z.string(),
    status: z.enum(["completed", "failed", "cancelled"]),
    elapsedMs: z.number().nonnegative(),
    submissions: z.number().int().nonnegative(),
    rejectedSubmissions: z.number().int().nonnegative(),
    usage: Usage.nullable(),
    configuration: z.record(z.string(), z.unknown()).nullable(),
    responses: z.array(
      z
        .object({
          model: z.string(),
          responseId: z.string().nullable(),
          finishReason: z.string().nullable().optional().default(null),
        })
        .passthrough(),
    ),
  })
  .passthrough();
export const FictionalReceiptSchema = z
  .object({
    caseId: z.string(),
    datasetVersion: z.string(),
    configurationHash: z.string(),
    sourceCommit: z.string(),
    requestHash: z.string(),
    requestedModel: z.string(),
    elapsedMs: z.number().nonnegative(),
    scope: z.string().startsWith("Fictional"),
    request: z
      .object({
        stage: z.enum(["interpret", "generate", "revise", "review_progress"]),
      })
      .passthrough(),
    result: z.unknown().nullable(),
    error: z.string().nullable(),
    summaries: z.array(Summary),
    traces: z.array(
      z
        .object({
          promptVersion: z.string(),
          contextHash: z.string(),
          schemaHash: z.string(),
        })
        .passthrough(),
    ),
    traceExport: z
      .object({
        runId: z.string().uuid().optional(),
        status: z.string(),
        content: z.literal("fictional"),
      })
      .passthrough(),
  })
  .passthrough();
export function comparisonRow(raw: unknown) {
  const r = FictionalReceiptSchema.parse(raw);
  const completed =
    r.error === null &&
    r.result !== null &&
    r.summaries.length > 0 &&
    r.summaries.every((s) => s.status === "completed");
  const counters = r.summaries.flatMap((s) => (s.usage ? [s.usage] : []));
  const reportedTokens = counters.length
    ? counters.reduce((n, u) => n + u.total_tokens, 0)
    : null;
  const signatures = r.traces.map((t, i) => ({
    promptVersion: t.promptVersion,
    contextHash: t.contextHash,
    schemaHash: t.schemaHash,
    configuration: r.summaries[i]?.configuration,
  }));
  return {
    caseId: r.caseId,
    datasetVersion: r.datasetVersion,
    stage: r.request.stage,
    requestHash: r.requestHash,
    configurationHash: r.configurationHash,
    sourceCommit: r.sourceCommit,
    requestedModel: r.requestedModel,
    returnedModels: [
      ...new Set(r.summaries.flatMap((s) => s.responses.map((v) => v.model))),
    ],
    status: completed ? "completed" : "failed",
    elapsedMs: r.elapsedMs,
    observedResponses: r.summaries.reduce((n, s) => n + s.responses.length, 0),
    rejectedSubmissions: r.summaries.reduce(
      (n, s) => n + s.rejectedSubmissions,
      0,
    ),
    firstSubmissionAccepted:
      completed &&
      r.summaries.every(
        (s) => s.submissions === 1 && s.rejectedSubmissions === 0,
      ),
    firstResponseAccepted:
      completed &&
      r.summaries.every(
        (s) =>
          s.submissions === 1 &&
          s.rejectedSubmissions === 0 &&
          s.responses.length === 1,
      ),
    reportedTokens,
    usageComplete:
      r.summaries.length > 0 &&
      counters.length === r.summaries.length &&
      completed,
    usdCost: null,
    qualityVerdict: null,
    runId: r.traceExport.runId ?? null,
    traceExportStatus: r.traceExport.status,
    systemSignature: signatures,
  };
}
export type ComparisonRow = ReturnType<typeof comparisonRow>;
export function compareReceipts(receipts: unknown[]) {
  const rows = receipts.map(comparisonRow);
  const groups = new Map<string, ComparisonRow[]>();
  for (const r of rows) {
    const key = JSON.stringify([
      r.datasetVersion,
      r.caseId,
      r.stage,
      r.requestHash,
    ]);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return {
    scope:
      "Operational candidate comparison only. Human usefulness and clinical outcomes are not inferred.",
    cases: [...groups.values()].map((candidates) => ({
      caseId: candidates[0].caseId,
      stage: candidates[0].stage,
      requestHash: candidates[0].requestHash,
      matchedCandidates: new Set(candidates.map((c) => c.configurationHash))
        .size,
      candidates,
    })),
    note: "Different prompts, tools, context, reasoning budgets or runtime versions compare complete systems, not isolated model effects. Observed responses/tokens can be a lower bound on failed attempts.",
  };
}
