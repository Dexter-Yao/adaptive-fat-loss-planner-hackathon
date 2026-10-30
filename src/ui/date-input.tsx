"use client";
// ABOUTME: English date entry composes official shadcn controls, independent of browser-native date labels.
// ABOUTME: The form owns its ISO date; calendar conversion and input validity are presentation-only.
import { useState, type CSSProperties, type InputHTMLAttributes } from "react";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { DateSchema } from "@/domain/facts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "onInput" | "onBlur" | "min" | "max"
> & {
  value: string;
  onValue: (value: string) => void;
  min?: string;
  max?: string;
};

function calendarDate(value: string | undefined): Date | undefined {
  return value && DateSchema.safeParse(value).success
    ? new Date(`${value}T12:00:00`)
    : undefined;
}

function validationMessage(
  value: string,
  required: boolean,
  min?: string,
  max?: string,
): string {
  if (!value) return required ? "Choose a date." : "";
  if (!DateSchema.safeParse(value).success)
    return "Enter a valid date as YYYY-MM-DD.";
  if (min && value < min) return `Choose a date on or after ${min}.`;
  if (max && value > max) return `Choose a date on or before ${max}.`;
  return "";
}

export function DateInput({
  value,
  onValue,
  min,
  max,
  required = false,
  disabled,
  readOnly,
  className,
  ...props
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = calendarDate(value);
  const before = calendarDate(min);
  const after = calendarDate(max);
  return (
    <div className="relative" data-slot="date-input">
      <Input
        {...props}
        ref={(node) => {
          node?.setCustomValidity(validationMessage(value, required, min, max));
        }}
        type="text"
        lang="en"
        inputMode="numeric"
        autoComplete="off"
        placeholder="YYYY-MM-DD"
        pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
        maxLength={10}
        className={cn("pr-12", className)}
        value={value}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(event) => {
          event.currentTarget.setCustomValidity(
            validationMessage(event.currentTarget.value, required, min, max),
          );
          onValue(event.currentTarget.value);
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute inset-y-0 right-0 rounded-l-none"
            aria-label="Choose date"
            disabled={disabled || readOnly}
          >
            <CalendarIcon aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            locale={enUS}
            selected={selected}
            defaultMonth={selected ?? before ?? after}
            required={required}
            disabled={[
              ...(before ? [{ before }] : []),
              ...(after ? [{ after }] : []),
            ]}
            style={
              {
                "--cell-size": "var(--component-control-height)",
              } as CSSProperties
            }
            onSelect={(date: Date | undefined) => {
              onValue(date ? format(date, "yyyy-MM-dd") : "");
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
