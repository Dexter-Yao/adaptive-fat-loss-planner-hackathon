// ABOUTME: Explicit fictional stage endpoint for the isolated example; never used by personal journey ports.
// ABOUTME: Real numerical forecasts still use A's calculator. Scripted text is not model evaluation evidence.
import { StageRequestSchema, StageResponseSchema } from "@/domain/workflow";
import { fictionalStage } from "@/fixtures/journey";
import { errorResponse, readApplicationJson } from "@/server/http";
export async function POST(request: Request) {
  try {
    const input = StageRequestSchema.parse(await readApplicationJson(request));
    const mode = new URL(request.url).searchParams.get("mode");
    if (mode === "model_unavailable")
      return Response.json(
        {
          error: "Simulated AI unavailable. Your preview inputs remain saved.",
        },
        { status: 503 },
      );
    if (mode === "slow_model")
      await new Promise((resolve) => setTimeout(resolve, 6000));
    const output = fictionalStage(input);
    if (mode === "suggest_revision" && output.stage === "review_progress") {
      output.result = {
        ...output.result,
        recommendation: "revise_plan",
        summary: "Fictional review: consider a more workable timeline.",
        proposedChangeSummary:
          "Review a later goal date while keeping practical meal choices.",
        uncertainty:
          "This is a scripted preview. Measurements alone do not establish why progress changed.",
      };
    }
    return Response.json(StageResponseSchema.parse(output), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
