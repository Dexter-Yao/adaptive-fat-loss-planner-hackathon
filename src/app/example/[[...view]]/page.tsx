// ABOUTME: Isolated example reuses the real screens with the example-only application adapters.
import { ExampleScreen } from "@/ui/example-screen";
import { OnboardingScreen } from "@/ui/onboarding-screen";
import { PlanScreen } from "@/ui/plan-screen";
import { ReplanningScreen } from "@/ui/replanning-screen";
import { RecordsScreen } from "@/ui/records-screen";
import { SettingsScreen } from "@/ui/settings-screen";
import { notFound, permanentRedirect } from "next/navigation";
export default async function ExamplePage({
  params,
}: {
  params: Promise<{ view?: string[] }>;
}) {
  const { view } = await params;
  const route = view?.join("/") ?? "";
  switch (route) {
    case "":
      return <ExampleScreen />;
    case "start":
      return <OnboardingScreen />;
    case "plan":
      return <PlanScreen />;
    case "progress":
      permanentRedirect("/example/plan#progress");
    case "models":
      permanentRedirect("/example/plan#models");
    case "replan":
      return <ReplanningScreen />;
    case "records":
      return <RecordsScreen />;
    case "settings":
      return <SettingsScreen />;
    default:
      notFound();
  }
}
