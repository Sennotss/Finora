"use client";

import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/** Label + control + description + error, wired for accessibility. */
export function FormField({
  id,
  label,
  error,
  description,
  required,
  className,
  children,
}: {
  id: string;
  label: React.ReactNode;
  error?: string;
  description?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Field data-invalid={error ? true : undefined} className={cn("gap-1.5", className)}>
      <FieldLabel htmlFor={id}>
        {label}
        {required && <span className="text-muted-foreground" aria-hidden> *</span>}
      </FieldLabel>
      {children}
      {description && !error && <FieldDescription>{description}</FieldDescription>}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  );
}

/** Copies server-side field errors (keyed by path) onto a react-hook-form instance. */
export function applyFieldErrors<T extends FieldValues>(form: UseFormReturn<T>, fieldErrors?: Record<string, string[]>) {
  if (!fieldErrors) return;
  for (const [key, messages] of Object.entries(fieldErrors)) {
    form.setError((key === "_form" ? "root" : key) as Path<T>, { type: "server", message: messages[0] });
  }
}

export function FormRootError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}
