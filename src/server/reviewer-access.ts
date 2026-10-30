// ABOUTME: Server-only reviewer-code authentication; no account or browser-health-data store.
// ABOUTME: Signed, expiring cookies protect real workflows; rotating the secret revokes all access.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "./http";

export const REVIEW_COOKIE = "adaptive_review";
export const REVIEW_SECONDS = 60 * 60 * 24 * 7;
type Environment = Record<string, string | undefined>;

export function reviewAccessEnabled(env: Environment = process.env): boolean {
  return env.ADAPTIVE_REVIEW_ACCESS === "true";
}

// Vercel's distributed WAF runs before this process. Its active configuration is
// read back by the deployment operator before this version is injected.
export function reviewAdmissionConfigured(
  env: Environment = process.env,
): boolean {
  if (env.VERCEL)
    return (
      env.ADAPTIVE_RATE_LIMIT_MODE === "vercel_waf" &&
      Boolean(env.ADAPTIVE_WAF_CONFIG_VERSION?.trim())
    );
  return (
    env.ADAPTIVE_RATE_LIMIT_MODE !== "vercel_waf" &&
    Boolean(env.ADAPTIVE_USAGE_DIR)
  );
}

export function reviewAccessConfigured(
  env: Environment = process.env,
): boolean {
  return (
    reviewAccessEnabled(env) &&
    (env.ADAPTIVE_REVIEW_CODE?.length ?? 0) >= 16 &&
    (env.ADAPTIVE_SESSION_SECRET?.length ?? 0) >= 32 &&
    reviewAdmissionConfigured(env)
  );
}

function equal(a: string, b: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function checkReviewCode(
  code: string,
  env: Environment = process.env,
): boolean {
  return reviewAccessConfigured(env) && equal(code, env.ADAPTIVE_REVIEW_CODE!);
}

export function createReviewToken(
  env: Environment = process.env,
  now = Date.now(),
): string {
  if (!reviewAccessConfigured(env))
    throw new HttpError(503, "Reviewer access is not configured.");
  const expires = Math.floor(now / 1000) + REVIEW_SECONDS;
  const payload = `reviewer.${expires}`;
  return `${payload}.${createHmac("sha256", env.ADAPTIVE_SESSION_SECRET!).update(payload).digest("base64url")}`;
}

export function validReviewToken(
  token: string | undefined,
  env: Environment = process.env,
  now = Date.now(),
): boolean {
  if (!token || !reviewAccessConfigured(env)) return false;
  const match = /^reviewer\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[1]),
    seconds = Math.floor(now / 1000);
  if (expires <= seconds || expires > seconds + REVIEW_SECONDS) return false;
  const signature = createHmac("sha256", env.ADAPTIVE_SESSION_SECRET!)
    .update(`reviewer.${expires}`)
    .digest("base64url");
  return equal(match[2], signature);
}

export function reviewTokenFromRequest(request: Request): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${REVIEW_COOKIE}=`))
    ?.slice(REVIEW_COOKIE.length + 1);
}

export function requireReviewer(request: Request): void {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.PUBLIC_DEMO_ENABLED === "true" &&
    !reviewAccessConfigured()
  )
    throw new HttpError(
      503,
      "Hosted inference is not configured for private reviewer access.",
    );
  if (!reviewAccessEnabled()) return;
  if (!reviewAccessConfigured())
    throw new HttpError(503, "Reviewer access is not configured.");
  if (!validReviewToken(reviewTokenFromRequest(request)))
    throw new HttpError(
      401,
      "Enter your reviewer access code to continue. Saved data remains in this browser.",
    );
}

export function safeReviewDestination(
  value: string | null | undefined,
): string {
  return value &&
    /^\/(?:start|plan|records|settings|replan)(?:[?#].*)?$/.test(value)
    ? value
    : "/start";
}
