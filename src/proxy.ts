// ABOUTME: Hosted reviewer gate for application routes; the labelled example stays public.
// ABOUTME: Inference also verifies access inside its HTTP handler; public numerical calculation is shared by the example.
import { NextRequest, NextResponse } from "next/server";
import {
  REVIEW_COOKIE,
  reviewAccessEnabled,
  reviewAccessConfigured,
  validReviewToken,
  safeReviewDestination,
} from "./server/reviewer-access";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (
    path.startsWith("/local-review") &&
    (process.env.NODE_ENV === "production" || reviewAccessEnabled())
  )
    return new NextResponse(null, { status: 404 });
  if (!reviewAccessEnabled()) {
    if (
      process.env.PUBLIC_DEMO_ENABLED === "true" &&
      process.env.NODE_ENV === "production"
    )
      return new NextResponse("Reviewer access has not been configured.", {
        status: 503,
      });
    return NextResponse.next();
  }
  if (
    path === "/" ||
    path === "/access" ||
    path.startsWith("/example/") ||
    path === "/example" ||
    path.startsWith("/_next/") ||
    [
      "/api/access",
      "/api/health",
      "/api/status",
      "/api/forecast",
      "/api/example/stage",
      "/favicon.ico",
    ].includes(path)
  )
    return NextResponse.next();
  if (!reviewAccessConfigured())
    return new NextResponse("Reviewer access has not been configured.", {
      status: 503,
    });
  if (validReviewToken(request.cookies.get(REVIEW_COOKIE)?.value))
    return NextResponse.next();
  if (path.startsWith("/api/"))
    return NextResponse.json(
      { error: "Enter your reviewer access code to continue." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  const destination = new URL("/access", request.url);
  destination.searchParams.set(
    "next",
    safeReviewDestination(path + request.nextUrl.search),
  );
  return NextResponse.redirect(destination);
}
export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
