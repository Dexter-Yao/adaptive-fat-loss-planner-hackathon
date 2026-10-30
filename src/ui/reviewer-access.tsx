"use client";
// ABOUTME: Minimal shadcn reviewer entry; credentials are posted to the server, never stored locally or in URLs.
// ABOUTME: Authentication uses full navigation so pre-authentication router redirects cannot be reused.
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "./form-field";

export function ReviewerAccess({ destination }: { destination: string }) {
  const [code, setCode] = useState(""),
    [status, setStatus] = useState<"idle" | "checking" | "opening">("idle"),
    [error, setError] = useState("");
  const busy = status !== "idle";
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setStatus("checking");
    setError("");
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
        signal: AbortSignal.timeout(20_000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true)
        throw new Error(
          response.status === 429
            ? "Too many attempts. Please wait a minute and try again."
            : result?.error || "Access could not be verified. Please retry.",
        );
      setCode("");
      setStatus("opening");
      window.location.replace(destination);
    } catch (e) {
      setStatus("idle");
      setError(
        e instanceof Error && e.name === "TimeoutError"
          ? "The access check took too long. Please retry."
          : e instanceof Error
            ? e.message
            : "Access could not be verified. Please retry.",
      );
    }
  }
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Reviewer access</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="subtle">
          Enter the code supplied with the submission to use the live planner.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <FormField>
            Access code
            <Input
              type="password"
              value={code}
              autoComplete="off"
              maxLength={256}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
            />
          </FormField>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy || !code}>
            {status === "opening"
              ? "Opening planner…"
              : status === "checking"
                ? "Checking…"
                : "Continue"}
          </Button>
        </form>
        <Button asChild variant="link">
          <Link href="/example">Explore the fictional example instead</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
