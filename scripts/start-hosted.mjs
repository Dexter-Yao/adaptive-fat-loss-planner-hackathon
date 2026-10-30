// ABOUTME: Starts the frozen NVIDIA candidate on a CPU Node host with explicit private access.
// ABOUTME: Validates server configuration before listening; never loads local credentials or calls inference.
import { readFile, mkdir, access } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { parseEnv } from "node:util";

for (const [key, minimum] of [
  ["NEBIUS_API_KEY", 1],
  ["ADAPTIVE_REVIEW_CODE", 16],
  ["ADAPTIVE_SESSION_SECRET", 32],
])
  if ((process.env[key]?.length ?? 0) < minimum)
    throw new Error(`Missing or invalid server configuration: ${key}`);
if (
  process.env.AGENT_PROVIDER !== "nebius" ||
  process.env.PUBLIC_DEMO_ENABLED !== "true" ||
  process.env.ADAPTIVE_REVIEW_ACCESS !== "true"
)
  throw new Error(
    "Hosted mode requires explicitly enabled Nebius and private reviewer access.",
  );
if (!process.env.ADAPTIVE_USAGE_DIR)
  throw new Error(
    "ADAPTIVE_USAGE_DIR must name the writable request ledger directory.",
  );
await mkdir(process.env.ADAPTIVE_USAGE_DIR, { recursive: true, mode: 0o700 });
await access(process.env.ADAPTIVE_USAGE_DIR, constants.R_OK | constants.W_OK);
const candidate = parseEnv(
  await readFile(
    new URL("../config/nemotron-candidate.env.example", import.meta.url),
    "utf8",
  ),
);
for (const [key, value] of Object.entries(candidate)) {
  if (
    !/^NEBIUS_(?:INTERPRET|GENERATE|REVISE|REVIEW_PROGRESS)_(?:MODEL|THINKING|MAX_TOKENS)$/.test(
      key,
    )
  )
    throw new Error("Invalid candidate configuration key.");
  if (!process.env[key]) process.env[key] = value;
}
process.env.ADAPTIVE_LOCAL_DIAGNOSTICS = "false";
const child = spawn(process.execPath, ["server.js"], {
  env: process.env,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => child.kill(signal));
child.once("error", () => {
  console.error("The hosted application could not start.");
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
