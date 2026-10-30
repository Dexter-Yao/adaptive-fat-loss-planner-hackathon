import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../src/app/api/journey/route";

test("a routed loopback Host is accepted even when Next's internal URL uses localhost", async () => {
  const response = await POST(
    new Request("http://localhost:3210/api/journey", {
      method: "POST",
      headers: { host: "127.0.0.1:3210", origin: "http://127.0.0.1:3210" },
      body: "{}",
    }),
  );
  // The incomplete form is rejected by domain validation, not by the origin check.
  assert.equal(response.status, 400);
});

test("cross-origin and oversized requests fail before any model is invoked", async () => {
  const otherOrigin = await POST(
    new Request("http://127.0.0.1:3210/api/journey", {
      method: "POST",
      headers: { origin: "https://another-site.example" },
      body: "{}",
    }),
  );
  assert.equal(otherOrigin.status, 403);
  const large = await POST(
    new Request("http://127.0.0.1:3210/api/journey", {
      method: "POST",
      body: " ".repeat(1_000_001),
    }),
  );
  assert.equal(large.status, 413);
});
