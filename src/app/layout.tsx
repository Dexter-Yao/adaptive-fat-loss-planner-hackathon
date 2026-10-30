// ABOUTME: Persistent root layout hosts one application store across route transitions.
import { AppShell } from "@/ui/app-shell";
import { ExperienceHost } from "@/ui/experience-host";
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Adaptive Fat Loss Planner",
  description:
    "A personalized plan that adapts to your progress and everyday life.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ExperienceHost>
          <AppShell>{children}</AppShell>
        </ExperienceHost>
      </body>
    </html>
  );
}
