// ABOUTME: Executable access-boundary and durable-admission checks; no provider calls or personal sessions.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  checkReviewCode,
  createReviewToken,
  validReviewToken,
  safeReviewDestination,
  reviewAccessConfigured,
  reviewAdmissionConfigured,
} from "../src/server/reviewer-access";
import { consumeRequestLimit } from "../src/server/request-limits";
import { POST as authenticate } from "../src/app/api/access/route";
import { POST as journey } from "../src/app/api/journey/route";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

const env = {
  ADAPTIVE_REVIEW_ACCESS: "true",
  ADAPTIVE_REVIEW_CODE: "synthetic-review-code",
  ADAPTIVE_SESSION_SECRET: "synthetic-session-secret-at-least-32-chars",
  ADAPTIVE_USAGE_DIR: "/synthetic",
};
test("reviewer credentials fail closed and cookies expire or become invalid on rotation", () => {
  assert.equal(reviewAccessConfigured({}), false);
  assert.equal(checkReviewCode("wrong", env), false);
  assert.equal(checkReviewCode(env.ADAPTIVE_REVIEW_CODE, env), true);
  const now = Date.UTC(2026, 9, 30),
    token = createReviewToken(env, now);
  assert.equal(validReviewToken(token, env, now + 1000), true);
  assert.equal(validReviewToken(token + "x", env, now), false);
  assert.equal(validReviewToken(token, env, now + 8 * 86400000), false);
  assert.equal(
    validReviewToken(
      token,
      {
        ...env,
        ADAPTIVE_SESSION_SECRET: "another-synthetic-secret-with-32-chars",
      },
      now,
    ),
    false,
  );
  assert.equal(safeReviewDestination("//outside.invalid"), "/start");
  assert.equal(safeReviewDestination("/plan?view=full"), "/plan?view=full");
});
test("Vercel admission requires an explicit read-back WAF version and never accepts a local directory", () => {
  assert.equal(
    reviewAdmissionConfigured({ VERCEL: "1", ADAPTIVE_USAGE_DIR: "/tmp" }),
    false,
  );
  assert.equal(
    reviewAdmissionConfigured({
      VERCEL: "1",
      ADAPTIVE_RATE_LIMIT_MODE: "vercel_waf",
    }),
    false,
  );
  assert.equal(
    reviewAdmissionConfigured({
      VERCEL: "1",
      ADAPTIVE_RATE_LIMIT_MODE: "vercel_waf",
      ADAPTIVE_WAF_CONFIG_VERSION: "3",
    }),
    true,
  );
  assert.equal(
    reviewAdmissionConfigured({
      ADAPTIVE_RATE_LIMIT_MODE: "vercel_waf",
      ADAPTIVE_WAF_CONFIG_VERSION: "3",
    }),
    false,
  );
});
test("disk admission serializes concurrent requests, survives new calls, and expires windows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "adaptive-admission-"));
  try {
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        consumeRequestLimit(dir, "stages", 2, 1000, 10000),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
    await assert.rejects(
      consumeRequestLimit(dir, "stages", 2, 1000, 10100),
      (e: unknown) => (e as { status: number }).status === 429,
    );
    await consumeRequestLimit(dir, "stages", 2, 1000, 12000);
    const key = createHash("sha256").update("stages").digest("hex");
    await writeFile(join(dir, key + ".json"), "not a ledger");
    await assert.rejects(consumeRequestLimit(dir, "stages", 2, 1000, 13000));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("hosted pages and inference require the same real code exchange; public example remains isolated", async () => {
  const directory = await mkdtemp(join(tmpdir(), "adaptive-access-"));
  const configured = {
    ...env,
    ADAPTIVE_USAGE_DIR: directory,
    NODE_ENV: "production",
    PUBLIC_DEMO_ENABLED: "true",
  };
  const saved = Object.fromEntries(
    Object.keys(configured).map((k) => [k, process.env[k]]),
  );
  Object.assign(process.env, configured);
  try {
    const deniedPage = proxy(new NextRequest("https://planner.example/plan"));
    assert.equal(deniedPage.status, 307);
    assert.match(deniedPage.headers.get("location")!, /\/access\?next=/);
    assert.equal(
      proxy(new NextRequest("https://planner.example/example/plan")).status,
      200,
    );
    const deniedModel = await journey(
      new Request("https://planner.example/api/journey", {
        method: "POST",
        body: "{}",
      }),
    );
    assert.equal(deniedModel.status, 401);
    const login = (code: string, origin = "https://planner.example") =>
      authenticate(
        new Request("https://planner.example/api/access", {
          method: "POST",
          headers: { origin, "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        }),
      );
    assert.equal(
      (await login(env.ADAPTIVE_REVIEW_CODE, "https://outside.invalid")).status,
      403,
    );
    assert.equal((await login("wrong")).status, 401);
    const success = await login(env.ADAPTIVE_REVIEW_CODE);
    assert.equal(success.status, 200);
    const cookie = success.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /SameSite=strict/i);
    const admitted = proxy(
      new NextRequest("https://planner.example/plan", {
        headers: { cookie: cookie.split(";")[0] },
      }),
    );
    assert.equal(admitted.status, 200);
    assert.equal(
      proxy(
        new NextRequest(
          "https://planner.example/local-review/recording-card.html",
        ),
      ).status,
      404,
    );
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
