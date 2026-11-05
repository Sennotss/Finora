"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormRootError } from "@/components/shared/form";
import { loginAction } from "@/features/auth/actions";
import { loginSchema, type LoginInput } from "@/features/auth/schemas";

export function LoginForm() {
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const reason = params.get("reason");

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined);
    startTransition(async () => {
      const result = await loginAction(values, params.get("callbackUrl") ?? undefined);
      if (result && !result.ok) setError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {reason === "password-changed" && (
        <p role="status" className="rounded-lg border bg-muted px-3 py-2 text-sm">Your password was changed. Please sign in again.</p>
      )}
      <FormField id="email" label="Email" error={form.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...form.register("email")} aria-invalid={Boolean(form.formState.errors.email)} />
      </FormField>
      <FormField id="password" label="Password" error={form.formState.errors.password?.message}>
        <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} aria-invalid={Boolean(form.formState.errors.password)} />
      </FormField>
      <FormRootError message={error} />
      <Button type="submit" className="h-9 w-full" disabled={pending}>
        {pending && <LoaderCircle className="animate-spin" aria-hidden />}
        Sign in
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        New to Finora?{" "}
        <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
