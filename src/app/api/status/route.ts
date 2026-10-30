import { providerStatus } from "@/agent/config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(providerStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}
