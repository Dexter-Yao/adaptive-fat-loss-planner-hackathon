// ABOUTME: Local-only Luna adapter using an ephemeral Codex app-server and native dynamic tools.
// ABOUTME: Host tools and persistent threads are disabled; never run this provider on a public deployment.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AgentProvider,
  BusinessTool,
  ToolHandler,
  ProviderObserver,
} from "../session";
import { localProviderConfig, type LocalProviderOptions } from "./local-config";

export function codexProvider(
  options: LocalProviderOptions = {},
): AgentProvider {
  const config = localProviderConfig(options);
  return {
    name: "codex",
    model: config.model,
    run: (instructions, context, tools, handle, signal, observer) =>
      runLocal(instructions, context, tools, handle, signal, config, observer),
  };
}

async function runLocal(
  instructions: string,
  context: string,
  tools: BusinessTool[],
  handle: ToolHandler,
  signal: AbortSignal,
  config: ReturnType<typeof localProviderConfig>,
  observer?: ProviderObserver,
): Promise<void> {
  if (process.env.VERCEL || process.env.NODE_ENV === "production")
    throw new Error(
      "Codex is local-only. Configure the Nebius provider for deployment.",
    );
  observer?.({ kind: "configuration", value: config });
  const cwd = await mkdtemp(join(tmpdir(), "fat-loss-agent-"));
  const args = [
    "-c",
    "project_doc_max_bytes=0",
    "-c",
    'developer_instructions=""',
    "-c",
    "include_environment_context=false",
    "-c",
    "include_permissions_instructions=false",
    "-c",
    "include_apps_instructions=false",
    "-c",
    "include_collaboration_mode_instructions=false",
    "-c",
    "skills.include_instructions=false",
    "-c",
    "skills.bundled.enabled=false",
    "-c",
    "mcp_servers={}",
    "-c",
    'web_search="disabled"',
    "--disable",
    "memories",
    "--disable",
    "multi_agent",
    "--disable",
    "shell_tool",
    "--disable",
    "unified_exec",
    "--disable",
    "view_image",
    "--disable",
    "image_generation",
    "--disable",
    "apps",
    "--disable",
    "plugins",
    "app-server",
    "--listen",
    "stdio://",
  ];
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key.startsWith("OPENAI_") ||
      key.startsWith("AZURE_OPENAI_") ||
      key.startsWith("CODEX_") ||
      key === "NEBIUS_API_KEY"
    )
      delete env[key];
  }
  const child = spawn("codex", args, {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map<
    number,
    {
      resolve: (value: Record<string, any>) => void;
      reject: (error: Error) => void;
    }
  >();
  let sequence = 0;
  let completed = false;
  let lastRejection: Record<string, unknown> | null = null;
  let presentationAccepted = false;
  let repairTurns = 0;
  let threadId = "";
  let diagnostic = "";
  child.stderr.on("data", (chunk: Buffer) => {
    diagnostic = (diagnostic + chunk.toString()).slice(-2000);
  });
  const send = (message: unknown) =>
    child.stdin.write(JSON.stringify(message) + "\n");
  const rpc = (method: string, params: unknown) =>
    new Promise<Record<string, any>>((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      send({ id, method, params });
    });
  let finish!: () => void;
  let fail!: (error: Error) => void;
  const done = new Promise<void>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  // Install a handler immediately, including during initialization failures.
  void done.catch(() => {});
  const abort = () => {
    const error = new Error("The agent request timed out or was cancelled.");
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
    fail(error);
    child.kill();
  };
  signal.addEventListener("abort", abort, { once: true });
  child.on("error", (error) => {
    for (const waiter of pending.values()) waiter.reject(error);
    fail(error);
  });
  child.on("exit", (code) => {
    if (!completed) {
      const error = new Error(
        `Local Codex stopped before completing (exit ${code}). Check your Codex sign-in and CLI. ${diagnostic.includes("unexpected argument") ? "The installed CLI rejected the isolation settings." : ""}`,
      );
      for (const waiter of pending.values()) waiter.reject(error);
      fail(error);
    }
  });
  const input = createInterface({ input: child.stdout });
  input.on("line", (line) => {
    void (async () => {
      let message: any;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (typeof message.id === "number" && !message.method) {
        const waiter = pending.get(message.id);
        pending.delete(message.id);
        if (message.error)
          waiter?.reject(
            new Error(message.error.message || "Codex RPC failed."),
          );
        else waiter?.resolve(message.result || {});
        return;
      }
      if (message.method === "item/tool/call") {
        const p = message.params || {};
        if (
          p.threadId !== threadId ||
          !tools.some((tool) => tool.name === p.tool) ||
          p.namespace != null
        )
          throw new Error("Unregistered tool request.");
        const result = await handle(p.tool, p.arguments);
        if (p.tool === "review_context" || p.tool === "forecast")
          presentationAccepted = false;
        lastRejection =
          result.status === "rejected" ? { tool: p.tool, ...result } : null;
        if (p.tool === tools.at(-1)?.name && result.status === "ok")
          presentationAccepted = true;
        send({
          id: message.id,
          result: {
            success: result.status !== "rejected",
            contentItems: [{ type: "inputText", text: JSON.stringify(result) }],
          },
        });
      } else if (message.id !== undefined && message.method) {
        send({
          id: message.id,
          error: {
            code: -32601,
            message: "Host capabilities are disabled for this application.",
          },
        });
        throw new Error(
          "The model requested a host capability instead of an application tool.",
        );
      } else if (message.method === "item/agentMessage/delta") {
        observer?.({
          kind: "assistant_text",
          value: message.params?.delta ?? "",
        });
      } else if (message.method === "thread/tokenUsage/updated") {
        observer?.({
          kind: "usage",
          value: message.params?.tokenUsage ?? null,
        });
      } else if (message.method === "turn/completed") {
        observer?.({ kind: "turn", value: message.params?.turn?.status });
        if (message.params?.turn?.status !== "completed")
          throw new Error("The local agent turn did not finish successfully.");
        if (!presentationAccepted && repairTurns < 1 && !signal.aborted) {
          repairTurns++;
          const rejection = lastRejection;
          lastRejection = null;
          await rpc("turn/start", {
            threadId,
            model: config.model,
            effort: config.reasoningEffort,
            input: [
              {
                type: "text",
                text: `The application has not accepted a complete result. Submit the required final registered business tool, not a plain-text answer. Correct any rejected arguments using the existing tool results. Last rejection: ${JSON.stringify(rejection)}. For numerical-prose errors, refer to displayed numbers without repeating physiological amounts. Finish only after the final registered tool returns status ok. The same total tool and time budgets still apply.`,
              },
            ],
          });
          return;
        }
        completed = true;
        finish();
      } else if (
        message.method === "error" ||
        message.method === "agent/refused"
      ) {
        throw new Error(
          message.params?.error?.message ||
            "The local model could not complete this request.",
        );
      }
    })().catch((error) => {
      fail(error instanceof Error ? error : new Error("Local agent failure."));
      child.kill();
    });
  });
  try {
    if (signal.aborted) {
      abort();
      throw new Error("The request was cancelled.");
    }
    await rpc("initialize", {
      clientInfo: {
        name: "adaptive-fat-loss-agent",
        title: "Adaptive Fat-Loss Agent",
        version: "0.1.0",
      },
      capabilities: { experimentalApi: true },
    });
    send({ method: "initialized" });
    const thread = await rpc("thread/start", {
      ephemeral: true,
      cwd,
      model: config.model,
      sandbox: "read-only",
      approvalPolicy: "never",
      baseInstructions: instructions,
      developerInstructions: `User-facing text follows the response-language policy in the base instructions. Preserve canonical property names, enum values and exact evidence quotations. Use only these registered business tools in the supplied order: ${tools.map((tool) => tool.name).join(", ")}.`,
      dynamicTools: tools.map((tool) => ({ type: "function", ...tool })),
    });
    threadId = thread.thread.id;
    await rpc("turn/start", {
      threadId,
      model: config.model,
      effort: config.reasoningEffort,
      input: [{ type: "text", text: context }],
    });
    await done;
  } finally {
    signal.removeEventListener("abort", abort);
    input.close();
    child.kill();
    await rm(cwd, { recursive: true, force: true });
  }
}
