// ABOUTME: Runs one loopback preview with the explicit Agent candidate; never rewrites private/default configuration.
// ABOUTME: Loads server credentials in memory and forwards shutdown to Next, without passing Node env-file flags to its re-exec.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
process.loadEnvFile(".env.local");
const candidate = parseEnv(
  await readFile("config/nemotron-candidate.env.example", "utf8"),
);
for (const key of Object.keys(candidate))
  if (
    !/^NEBIUS_(?:INTERPRET|GENERATE|REVISE|REVIEW_PROGRESS)_(?:MODEL|THINKING|MAX_TOKENS)$/.test(
      key,
    )
  )
    throw new Error(
      "Candidate configuration must contain only stage-specific model settings.",
    );
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3221",
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      ...candidate,
      AGENT_PROVIDER: "nebius",
      ADAPTIVE_TRACE_METADATA: "true",
      ADAPTIVE_LOCAL_DIAGNOSTICS: "true",
    },
    stdio: "inherit",
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => child.kill(signal));
child.once("error", () => {
  console.error("The local candidate preview could not start.");
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
