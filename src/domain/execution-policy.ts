// ABOUTME: One bounded generation/request time policy shared by Agent batches and the browser controller.
// ABOUTME: Transport has room to receive a server failure; time budgets never increase candidate/repair counts.
export const JOURNEY_GENERATION_TIMEOUT_MS = 540_000;
export function journeyRequestTimeoutMs(stage: string): number {
  if (stage === "calculate" || stage === "accept") return 30_000;
  if (stage === "generate" || stage === "revise") return 600_000;
  return 180_000;
}
