"use client";
// ABOUTME: Shared task-level compositions of official shadcn primitives; no facts or calculations live here.
// ABOUTME: Disclosure and empty-state semantics stay consistent across the focused application pages.
import type { ReactNode } from "react";
import { ChevronDown, CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
export function Disclosure({
  title,
  children,
  className,
  defaultOpen = false,
  open,
  onOpenChange,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
      className={cn("task-disclosure", className)}
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="disclosure-trigger group"
        >
          <span>{title}</span>
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="disclosure-body">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
export function EmptyTask({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Empty className="border border-dashed bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleHelp aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}
