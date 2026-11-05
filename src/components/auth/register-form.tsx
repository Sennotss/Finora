"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, FormRootError, applyFieldErrors } from "@/components/shared/form";
import { registerAction } from "@/features/auth/actions";
import { registerSchema, type RegisterInput } from "@/features/auth/schemas";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";

export function RegisterForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema) as never,
    defaultValues: { name: "", email: "", password: "", confirmPassword: "", baseCurrency: "IDR" },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(() => {
    setError(undefined);
    startTransition(async () => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const result = await registerAction(form.getValues(), timezone);
      if (result && !result.ok) {
        setError(result.fieldErrors ? undefined : result.error);
        applyFieldErrors(form, result.fieldErrors);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormField id="name" label="Name" error={e.name?.message}>
        <Input id="name" autoComplete="name" {...form.register("name")} aria-invalid={Boolean(e.name)} />
      </FormField>
      <FormField id="email" label="Email" error={e.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...form.register("email")} aria-invalid={Boolean(e.email)} />
      </FormField>
      <FormField id="password" label="Password" error={e.password?.message} description="At least 8 characters with a letter and a number.">
        <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} aria-invalid={Boolean(e.password)} />
      </FormField>
      <FormField id="confirmPassword" label="Confirm password" error={e.confirmPassword?.message}>
        <Input id="confirmPassword" type="password" autoComplete="new-password" {...form.register("confirmPassword")} aria-invalid={Boolean(e.confirmPassword)} />
      </FormField>
      <FormField id="baseCurrency" label="Main currency" description="Totals and reports are shown in this currency.">
        <Controller
          control={form.control}
          name="baseCurrency"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="baseCurrency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </FormField>
      <FormRootError message={error} />
      <Button type="submit" className="h-9 w-full" disabled={pending}>
        {pending && <LoaderCircle className="animate-spin" aria-hidden />}
        Create account
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
