"use client";
// ABOUTME: Compose shadcn Field and FieldLabel with one stable explicit control association.
// ABOUTME: This is label/layout glue only; values, validation and units remain with the owning form.
import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactNode,
} from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
type ControlProps = {
  id?: string;
  value?: unknown;
  checked?: unknown;
  "aria-label"?: string;
};
export function FormField({
  children,
  className,
  htmlFor,
}: {
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  const generated = useId(),
    items = Children.toArray(children),
    index = items.findIndex(
      (c) =>
        isValidElement<ControlProps>(c) &&
        ("value" in c.props || "checked" in c.props),
    );
  if (index < 0)
    return (
      <Label className={className} htmlFor={htmlFor}>
        {children}
      </Label>
    );
  const control = items[index];
  if (!isValidElement<ControlProps>(control))
    throw new Error("A field needs one control.");
  const id = control.props.id ?? generated,
    checkbox = "checked" in control.props,
    label = items.filter((_, i) => i !== index),
    input = cloneElement(control, { id });
  return (
    <Field
      className={cn("app-field", className)}
      orientation={checkbox ? "horizontal" : "vertical"}
    >
      {checkbox ? input : null}
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {!checkbox ? input : null}
    </Field>
  );
}
