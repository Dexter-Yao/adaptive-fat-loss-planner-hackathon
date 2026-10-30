// ABOUTME: Non-sensitive liveness endpoint; it does not call models or claim provider readiness.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
