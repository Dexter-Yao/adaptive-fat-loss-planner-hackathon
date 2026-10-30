// ABOUTME: Hosted admission dispatch: Vercel's verified upstream WAF or the standalone disk ledger.
// ABOUTME: Never treats instance memory or /tmp as distributed counters; neither backend stores health data.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { HttpError } from "./http";
import { reviewAdmissionConfigured } from "./reviewer-access";

export async function enforceHostedRequestLimit(
  identity: string,
  maximum: number,
  windowMs: number,
): Promise<void> {
  if (!reviewAdmissionConfigured())
    throw new HttpError(503, "Hosted request admission is not configured.");
  // The platform limits the actual route before invocation. This is not an
  // in-process counter or a claim that filesystem writes persist on Vercel.
  if (process.env.VERCEL) return;
  await consumeRequestLimit(
    process.env.ADAPTIVE_USAGE_DIR!,
    identity,
    maximum,
    windowMs,
  );
}

export async function consumeRequestLimit(
  directory: string,
  identity: string,
  maximum: number,
  windowMs: number,
  now = Date.now(),
): Promise<void> {
  const key = createHash("sha256").update(identity).digest("hex");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, `${key}.json`),
    lock = `${file}.lock`;
  let acquired = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await mkdir(lock);
      acquired = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  if (!acquired)
    throw new HttpError(
      503,
      "Request admission is busy. Please retry shortly.",
    );
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    let timestamps: number[] = [];
    try {
      const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
      if (
        !Array.isArray(parsed) ||
        parsed.some((v) => typeof v !== "number" || !Number.isFinite(v))
      )
        throw new Error("Invalid request ledger.");
      timestamps = parsed.filter((v) => v > now - windowMs);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (timestamps.length >= maximum)
      throw new HttpError(
        429,
        "Several requests are already being processed. Please wait a few minutes and retry; saved data is unchanged.",
      );
    timestamps.push(now);
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(timestamps));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
    const parent = await open(directory, "r");
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  } finally {
    await rm(temporary, { force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
