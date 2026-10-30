// ABOUTME: Provider-independent, validated numerical evaluation of canonical browser facts.
import {
  CoachRequestSchema,
  ForecastResponseSchema,
  dateInZone,
} from "@/domain/contracts";
import { enforceContext } from "@/domain/context";
import { evaluatePlanning } from "@/planning/evaluate";
import { readApplicationJson, errorResponse } from "@/server/http";
import { CalculationRequestSchema } from "@/domain/workflow";
import { calculateJourney } from "@/planning/journey-calculation";
import { reviewAccessEnabled } from "@/server/reviewer-access";
import { enforceHostedRequestLimit } from "@/server/request-limits";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (reviewAccessEnabled()) {
      await enforceHostedRequestLimit("numerical-forecasts", 120, 60_000);
    }
    const raw = await readApplicationJson(request);
    if (
      typeof raw === "object" &&
      raw !== null &&
      "kind" in raw &&
      raw.kind === "journey_calculation"
    )
      return Response.json(
        calculateJourney(CalculationRequestSchema.parse(raw)),
        { headers: { "Cache-Control": "no-store" } },
      );
    const input = CoachRequestSchema.parse(raw);
    const outcome = evaluatePlanning(input);
    return Response.json(
      ForecastResponseSchema.parse({
        ...outcome,
        sessionId: input.sessionId,
        sourceRevision: input.sourceRevision,
        asOfDate: input.asOfDate ?? dateInZone(input.profile.timezone),
        context: enforceContext(input),
        explanation: null,
        provider: null,
        model: null,
        toolCalls: [],
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
