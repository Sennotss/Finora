"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ColorPicker } from "@/components/shared/color-picker";
import { FormField, FormRootError, applyFieldErrors } from "@/components/shared/form";
import { MoneyInput } from "@/components/shared/money-input";
import { useServerAction } from "@/components/shared/use-action";
import type { AccountOption } from "@/components/transactions/types";
import { createGoalAction, updateGoalAction } from "@/features/goals/actions";
import { GOAL_CATEGORIES, GOAL_CATEGORY_LABELS, GOAL_PRIORITIES, goalInputSchema, type GoalInput } from "@/features/goals/schemas";

export function GoalForm({ goalId, initial, accounts, currency, locale, onDone }: { goalId?: string; initial?: Partial<GoalInput>; accounts: AccountOption[]; currency: string; locale: string; onDone: () => void }) {
  const { pending, run } = useServerAction();
  const form = useForm<GoalInput>({
    resolver: zodResolver(goalInputSchema) as never,
    defaultValues: { name: "", category: "GENERAL", targetAmount: "", targetDate: "", priority: "MEDIUM", linkedAccountId: "none", description: "", notes: "", color: "#1baf7a", initialAmount: "", ...initial },
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async () => {
    const values = form.getValues();
    await run<unknown>(() => (goalId ? updateGoalAction(goalId, values) : createGoalAction(values)), { onSuccess: onDone, onError: (r) => applyFieldErrors(form, r.fieldErrors) });
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="g-name" label="Goal name" error={e.name?.message} required>
          <Input id="g-name" placeholder="e.g. New laptop" maxLength={80} {...form.register("name")} />
        </FormField>
        <FormField id="g-cat" label="Type">
          <Controller control={form.control} name="category" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="g-cat" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{GOAL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{GOAL_CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent>
            </Select>
          )} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="g-target" label="Target amount" error={e.targetAmount?.message} required>
          <Controller control={form.control} name="targetAmount" render={({ field }) => <MoneyInput id="g-target" value={field.value} onChange={field.onChange} currency={currency} locale={locale} />} />
        </FormField>
        <FormField id="g-date" label="Target date" error={e.targetDate?.message} description="Optional — needed for a monthly savings target.">
          <Input id="g-date" type="date" {...form.register("targetDate")} />
        </FormField>
      </div>
      {!goalId && (
        <FormField id="g-initial" label="Already saved" description="Recorded as the first contribution.">
          <Controller control={form.control} name="initialAmount" render={({ field }) => <MoneyInput id="g-initial" value={field.value ?? ""} onChange={field.onChange} currency={currency} locale={locale} />} />
        </FormField>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="g-priority" label="Priority">
          <Controller control={form.control} name="priority" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="g-priority" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{GOAL_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</SelectItem>)}</SelectContent>
            </Select>
          )} />
        </FormField>
        <FormField id="g-account" label="Linked account" description="Where the money is kept (for reference).">
          <Controller control={form.control} name="linkedAccountId" render={({ field }) => (
            <Select value={field.value ?? "none"} onValueChange={field.onChange}>
              <SelectTrigger id="g-account" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )} />
        </FormField>
      </div>
      <FormField id="g-desc" label="Description" error={e.description?.message}>
        <Input id="g-desc" maxLength={300} {...form.register("description")} />
      </FormField>
      <FormField id="g-notes" label="Notes">
        <Textarea id="g-notes" rows={2} maxLength={1000} {...form.register("notes")} />
      </FormField>
      <FormField id="g-color" label="Colour">
        <Controller control={form.control} name="color" render={({ field }) => <ColorPicker id="g-color" value={field.value ?? "#1baf7a"} onChange={field.onChange} />} />
      </FormField>
      <FormRootError message={e.root?.message} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending && <LoaderCircle className="animate-spin" />}{goalId ? "Save changes" : "Create goal"}</Button>
      </div>
    </form>
  );
}
