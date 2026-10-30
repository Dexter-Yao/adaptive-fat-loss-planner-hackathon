// ABOUTME: Provider protocol checks use synthetic HTTP responses, independently of coaching quality.
// ABOUTME: Failed, malformed or truncated output never becomes successful model inference.
import assert from "node:assert/strict";
import test from "node:test";
import { nebiusProvider } from "../src/agent/providers/nebius";
const tools = [
  {
    name: "present_review",
    description: "Submit review",
    inputSchema: { type: "object" },
  },
];
test("an evaluation guard runs for each real repair and can stop before another HTTP call", async () => {
  const previous = globalThis.fetch;
  let requests = 0,
    reservations = 0;
  globalThis.fetch = async () => {
    requests++;
    return Response.json(payload());
  };
  try {
    await assert.rejects(
      nebiusProvider({
        apiKey: "fictional-test-key",
        beforeRequest: ({ inputBytes }) => {
          assert.ok(inputBytes > 0);
          reservations++;
          if (reservations > 1) throw Error("budget stop");
        },
      }).run(
        "i",
        "c",
        tools,
        async () => ({ status: "rejected", repairRemaining: 1 }),
        AbortSignal.timeout(1000),
      ),
      /budget stop/,
    );
    assert.equal(requests, 1);
    assert.equal(reservations, 2);
  } finally {
    globalThis.fetch = previous;
  }
});

test("the final rejected candidate stops before billing another provider request", async () => {
  const previous = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return Response.json(payload());
  };
  try {
    await assert.rejects(
      nebiusProvider({ apiKey: "fictional-test-key" }).run(
        "instructions",
        "context",
        tools,
        async () => ({
          status: "rejected",
          issues: ["Invalid candidate"],
          repairRemaining: 2 - requests,
        }),
        AbortSignal.timeout(1000),
      ),
      /bounded submission budget/,
    );
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = previous;
  }
});
test("malformed multi-candidate responses cannot evade the two-request single-tool ceiling", async () => {
  const previous = globalThis.fetch;
  let requests = 0,
    executions = 0;
  globalThis.fetch = async () => {
    requests++;
    const p = payload();
    p.choices[0].message.tool_calls.push({
      ...p.choices[0].message.tool_calls[0],
      id: "second-call",
    });
    return Response.json(p);
  };
  try {
    await assert.rejects(
      nebiusProvider({ apiKey: "fictional-test-key" }).run(
        "i",
        "c",
        tools,
        async () => {
          executions++;
          return { status: "ok" };
        },
        AbortSignal.timeout(1000),
      ),
      /request budget/,
    );
    assert.equal(requests, 2);
    assert.equal(executions, 0);
  } finally {
    globalThis.fetch = previous;
  }
});
function payload(argumentsText = "{}", model = "fixture-model") {
  return {
    id: "fixture-response",
    model,
    usage: { prompt_tokens: 10, completion_tokens: 3 },
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "fixture-call",
              type: "function",
              function: { name: "present_review", arguments: argumentsText },
            },
          ],
        },
      },
    ],
  };
}
test("a provider captures its model, forces the sole tool and records actual response metadata", async () => {
  const fetch = globalThis.fetch;
  const previous = process.env.NEBIUS_MODEL;
  const responses: unknown[] = [];
  const p = nebiusProvider({
    apiKey: "fictional-test-key",
    model: "fixed-model",
    onResponse: (r) => {
      responses.push(r);
    },
  });
  process.env.NEBIUS_MODEL = "changed-after-creation";
  globalThis.fetch = async (_url, options) => {
    const b = JSON.parse(String(options?.body));
    assert.equal(b.model, "fixed-model");
    assert.equal(b.tool_choice.function.name, "present_review");
    return Response.json(payload("{}", "actual-response-model"));
  };
  try {
    await p.run(
      "instructions",
      "context",
      tools,
      async () => ({ status: "ok" }),
      AbortSignal.timeout(1000),
    );
    assert.equal(p.model, "fixed-model");
    assert.equal(
      (responses[0] as { model: string }).model,
      "actual-response-model",
    );
  } finally {
    globalThis.fetch = fetch;
    if (previous === undefined) delete process.env.NEBIUS_MODEL;
    else process.env.NEBIUS_MODEL = previous;
  }
});
test("unauthorized/truncated/malformed/silent completions fail without invoking a business tool", async () => {
  const fetch = globalThis.fetch;
  const p = nebiusProvider({ apiKey: "fictional-test-key" });
  let calls = 0;
  const handler = async () => {
    calls++;
    return { status: "ok" };
  };
  const truncated = payload();
  truncated.choices[0].finish_reason = "length";
  const silent = {
    choices: [
      {
        finish_reason: "stop",
        message: { role: "assistant", content: "I finished." },
      },
    ],
  };
  const responses = [
    new Response("invalid credentials", { status: 401 }),
    Response.json({ choices: [] }),
    Response.json(truncated),
    Response.json(silent),
    Response.json(payload("not-json")),
  ];
  try {
    for (const response of responses) {
      globalThis.fetch = async () => response;
      await assert.rejects(
        p.run("i", "c", tools, handler, AbortSignal.timeout(1000)),
      );
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = fetch;
  }
});
test("a pre-cancelled call and an unexpected hostname never send a credential", async () => {
  const fetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json(payload());
  };
  try {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      nebiusProvider({ apiKey: "fictional-test-key" }).run(
        "i",
        "c",
        tools,
        async () => ({ status: "ok" }),
        controller.signal,
      ),
    );
    await assert.rejects(
      nebiusProvider({
        apiKey: "fictional-test-key",
        baseUrl: "https://unrelated.invalid/v1",
      }).run(
        "i",
        "c",
        tools,
        async () => ({ status: "ok" }),
        AbortSignal.timeout(1000),
      ),
      /official HTTPS/,
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = fetch;
  }
});
test("Qwen's requested thinking mode is explicit, captured without credentials and never silently changed", async () => {
  const fetch = globalThis.fetch;
  try {
    for (const thinking of [undefined, true]) {
      const events: unknown[] = [];
      globalThis.fetch = async (_url, options) => {
        const body = JSON.parse(String(options?.body));
        assert.equal(
          body.chat_template_kwargs.enable_thinking,
          thinking ?? false,
        );
        return Response.json(payload());
      };
      const p = nebiusProvider({
        model: "Qwen/Qwen3.5-397B-A17B",
        apiKey: "fictional-private-key",
        thinking,
      });
      await p.run(
        "i",
        "c",
        tools,
        async () => ({ status: "ok" }),
        AbortSignal.timeout(1000),
        (e) => events.push(e),
      );
      assert.match(JSON.stringify(events), /requestedThinking/);
      assert.ok(!JSON.stringify(events).includes("fictional-private-key"));
    }
  } finally {
    globalThis.fetch = fetch;
  }
});
test("a single-stage batch is rejected before execution and retried as one candidate", async () => {
  const fetch = globalThis.fetch;
  let requests = 0,
    calls = 0;
  try {
    globalThis.fetch = async (_u, options) => {
      const b = JSON.parse(String(options?.body));
      assert.equal(b.parallel_tool_calls, false);
      requests++;
      const response = payload();
      if (requests === 1)
        response.choices[0].message.tool_calls.push({
          ...response.choices[0].message.tool_calls[0],
          id: "duplicate",
        });
      else
        assert.equal(
          b.messages.filter((m: { role: string }) => m.role === "tool").length,
          2,
        );
      return Response.json(response);
    };
    await nebiusProvider({ apiKey: "fictional-test-key" }).run(
      "i",
      "c",
      tools,
      async () => {
        calls++;
        return { status: "ok" };
      },
      AbortSignal.timeout(1000),
    );
    assert.equal(requests, 2);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = fetch;
  }
});
test("a null tool-call field on truncation is classified without exposing reasoning text", async () => {
  const fetch = globalThis.fetch,
    events: unknown[] = [];
  try {
    globalThis.fetch = async () =>
      Response.json({
        id: "truncated",
        model: "synthetic",
        choices: [
          {
            finish_reason: "length",
            message: {
              role: "assistant",
              content: null,
              tool_calls: null,
              reasoning_content: "private reasoning text",
            },
          },
        ],
      });
    await assert.rejects(
      nebiusProvider({ apiKey: "fictional-test-key" }).run(
        "i",
        "c",
        tools,
        async () => ({ status: "ok" }),
        AbortSignal.timeout(1000),
        (e) => events.push(e),
      ),
      /incomplete response/,
    );
    assert.ok(!JSON.stringify(events).includes("private reasoning text"));
  } finally {
    globalThis.fetch = fetch;
  }
});
