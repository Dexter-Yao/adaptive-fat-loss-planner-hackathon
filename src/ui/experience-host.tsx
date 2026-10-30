"use client";
// ABOUTME: Selects an explicit isolated preview adapter; both modes use A's same application provider and commands.
import { ExampleRuntime } from "@/application/preview-runtime";
import { ApplicationProvider } from "@/application/provider";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
const PreviewContext = createContext<{
  runtime: ExampleRuntime;
  clockVersion: number;
  refreshClock: () => void;
} | null>(null);
export const usePreview = () => useContext(PreviewContext);
export function ExperienceHost({ children }: { children: ReactNode }) {
  const example = usePathname().startsWith("/example"),
    runtime = useMemo(() => new ExampleRuntime(), []),
    [clockVersion, setClockVersion] = useState(0);
  return (
    <PreviewContext.Provider
      value={
        example
          ? {
              runtime,
              clockVersion,
              refreshClock: () => setClockVersion((v) => v + 1),
            }
          : null
      }
    >
      <ApplicationProvider
        key={example ? "example" : "personal"}
        runtime={example ? runtime : undefined}
        clockVersion={clockVersion}
      >
        {children}
      </ApplicationProvider>
    </PreviewContext.Provider>
  );
}
