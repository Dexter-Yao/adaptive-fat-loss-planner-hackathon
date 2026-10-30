"use client";
// ABOUTME: Compact explanations use shadcn dialogs on pages and inline disclosure inside an existing editor.
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Info } from "lucide-react";
import type { ReactNode } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function ExplanationDisclosure({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Collapsible className="inline-explanation">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={title}
          title={title}
        >
          <Info aria-hidden />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="field-hint">{children}</CollapsibleContent>
    </Collapsible>
  );
}
export function ExplanationDialog({
  title,
  children,
  description = "Details behind the displayed estimate.",
}: {
  title: string;
  children: ReactNode;
  description?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={title} title={title}>
          <Info aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="explanation-copy">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
