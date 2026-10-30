// ABOUTME: Validates a server-only reviewer code and creates a bounded HttpOnly session.
import { NextResponse } from "next/server";
import {
  checkReviewCode,
  createReviewToken,
  REVIEW_COOKIE,
  REVIEW_SECONDS,
} from "@/server/reviewer-access";
import { enforceHostedRequestLimit } from "@/server/request-limits";
import { errorResponse, HttpError, readApplicationJson } from "@/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const input = await readApplicationJson(request);
    const code =
      typeof input === "object" && input !== null && "code" in input
        ? input.code
        : null;
    if (typeof code !== "string" || code.length > 256)
      throw new HttpError(400, "Enter the reviewer access code.");
    // The standalone ledger is global; Vercel enforces per-IP limits upstream.
    await enforceHostedRequestLimit("reviewer-login", 30, 60_000);
    if (!checkReviewCode(code))
      throw new HttpError(401, "That access code was not recognized.");
    const response = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(REVIEW_COOKIE, createReviewToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: REVIEW_SECONDS,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
