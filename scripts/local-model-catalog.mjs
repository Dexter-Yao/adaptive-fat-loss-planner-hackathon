// ABOUTME: Read account-specific local Codex model metadata without creating a conversation or running inference.
// ABOUTME: Only model IDs/capabilities are saved; authentication and provider credentials never enter receipts.
import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cwd = await mkdtemp(join(tmpdir(), "adaptive-catalog-"));
const env = { ...process.env };
for (const key of Object.keys(env))
  if (/^(OPENAI_|AZURE_OPENAI_|NEBIUS_)/.test(key)) delete env[key];
const child = spawn(
  "codex",
  [
    "-c",
    "mcp_servers={}",
    "--disable",
    "apps",
    "--disable",
    "plugins",
    "app-server",
    "--listen",
    "stdio://",
  ],
  { cwd, env, stdio: ["pipe", "pipe", "pipe"] },
);
const pending = new Map();
let seq = 0;
const send = (x) => child.stdin.write(JSON.stringify(x) + "\n");
const rpc = (method, params) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    send({ id, method, params });
  });
const fail = (error) => {
  for (const p of pending.values()) p.reject(error);
  pending.clear();
};
child.on("error", fail);
child.on("exit", () =>
  fail(new Error("Catalog process ended before the request completed.")),
);
const lines = createInterface({ input: child.stdout });
lines.on("line", (line) => {
  let m;
  try {
    m = JSON.parse(line);
  } catch {
    return;
  }
  if (m.id !== undefined && !m.method) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) p?.reject(new Error("Codex rejected model discovery."));
    else p?.resolve(m.result);
  }
});
const timeout = setTimeout(() => {
  fail(new Error("Local catalog discovery timed out."));
  child.kill();
}, 30_000);
try {
  await rpc("initialize", {
    clientInfo: { name: "adaptive-eval-catalog", version: "1.0" },
    capabilities: { experimentalApi: true },
  });
  send({ method: "initialized" });
  const result = await rpc("model/list", { limit: 100 });
  const receipt = {
    checkedAt: new Date().toISOString(),
    cli: execFileSync("codex", ["--version"], { encoding: "utf8" }).trim(),
    models: result.data.map((m) => ({
      id: m.id,
      model: m.model,
      name: m.displayName,
      reasoning: m.supportedReasoningEfforts,
      defaultReasoning: m.defaultReasoningEffort,
    })),
  };
  const dir = ".runtime/llm-stages-2026-10-28";
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "local-model-catalog.json"),
    JSON.stringify(receipt, null, 2),
  );
  console.log(
    JSON.stringify({
      cli: receipt.cli,
      luna: receipt.models.filter((m) => /luna/i.test(m.model ?? m.id)),
    }),
  );
} finally {
  clearTimeout(timeout);
  lines.close();
  child.kill();
  await rm(cwd, { recursive: true, force: true });
}
