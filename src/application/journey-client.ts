// ABOUTME: Typed browser transports for the deterministic core and B-owned model-stage endpoint.
// ABOUTME: Unavailable endpoints fail explicitly; no canned journey substitutes for inference.
import {
  CalculationResponseSchema,
  StageResponseSchema,
  type JourneyPorts,
} from "../domain/workflow";
async function post(
  path: string,
  body: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    let message =
      "The requested stage is unavailable. Your saved inputs and plan remain intact.";
    try {
      const payload = await response.json();
      if (typeof payload.error === "string") message = payload.error;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}
export const journeyHttpPorts: JourneyPorts = {
  calculate: async (r, s) =>
    CalculationResponseSchema.parse(await post("/api/forecast", r, s)),
  stage: async (r, s) =>
    StageResponseSchema.parse(await post("/api/journey", r, s)),
};
