"use client";
// ABOUTME: Welcome remains revisit-able without clearing the saved personal session.
// ABOUTME: Example navigation enters a separate route rather than replacing personal data.
import { useApplication } from "@/application/provider";
import { WelcomeScreen } from "@/ui/welcome-screen";
import { useRouter } from "next/navigation";
export default function RootPage() {
  const app = useApplication(),
    router = useRouter();
  return (
    <WelcomeScreen
      hasSession={!!app.session}
      onStart={() => router.push(app.session ? "/plan" : "/start")}
      onExample={() => router.push("/example")}
    />
  );
}
