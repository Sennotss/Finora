"use client";

import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormField, FormRootError, applyFieldErrors } from "@/components/shared/form";
import { MoneyInput } from "@/components/shared/money-input";
import { useServerAction } from "@/components/shared/use-action";
import { groupCategories, type CategoryOption } from "@/components/transactions/types";
import { createBudgetAction, updateBudgetAction } from "@/features/budgets/actions";
import { BUDGET_PERIODS, BUDGET_PERIOD_LABELS, budgetInputSchema, type BudgetInput } from "@/features/budgets/schemas";
import { D } from "@/lib/money";

export function BudgetForm({ budgetId, initial, categories, currency, locale, today, onDone }: { budgetId?: string; initial?: Partial<BudgetInput>; categories: CategoryOption[]; currency: string; locale: string; today: string; onDone: () => void }) {
  const { pending, run } = useServerAction();
  const form = useForm<BudgetInput>({
    resolver: zodResolver(budgetInputSchema) as never,
    defaultValues: { name: "", period: "MONTHLY", amount: "", startDate: `${today.slice(0, 8)}01`, endDate: "", alertsEnabled: true, notes: "", lines: [], ...initial },
  });
  const lines = useFieldArray({ control: form.control, name: "lines" });
  const period = form.watch("period");
  const watchedLines = form.watch("lines") ?? [];
  const linesTotal = watchedLines.reduce((acc, l) => acc.plus(D(l.amount || 0)), D(0));
  const e = form.formState.errors;
  const grouped = groupCategories(categories, "EXPENSE");

  const submit = form.handleSubmit(async () => {
    const values = form.getValues();
    await run(() => (budgetId ? updateBudgetAction(budgetId, values) : createBudgetAction(values)), {
      onSuccess: onDone,
      onError: (r) => applyFieldErrors(form, r.fieldErrors),
    });
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="b-name" label="Name" error={e.name?.message} required>
          <Input id="b-name" placeholder="e.g. Monthly spending" maxLength={60} {...form.register("name")} />
        </FormField>
        <FormField id="b-period" label="Period" required>
          <Controller
            control={form.control}
            name="period"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="b-period" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{BUDGET_PERIODS.map((p) => <SelectItem key={p} value={p}>{BUDGET_PERIOD_LABELS[p]}</SelectItem>)}</SelectContent>
              </Select>
            )}
          />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="b-start" label={period === "CUSTOM" ? "Start date" : "Starts on"} error={e.startDate?.message} description={period === "MONTHLY" ? "Pick the 1st for calendar months, or your payday." : period === "WEEKLY" ? "Weeks repeat from this day." : undefined}>
          <Input id="b-start" type="date" {...form.register("startDate")} />
        </FormField>
        {period === "CUSTOM" && (
          <FormField id="b-end" label="End date" error={e.endDate?.message} required>
            <Input id="b-end" type="date" {...form.register("endDate")} />
          </FormField>
        )}
      </div>
      <FormField id="b-amount" label="Total spending limit" error={e.amount?.message} required description={watchedLines.length ? "Applies to the categories below combined." : "With no categories, every expense counts toward this limit."}>
        <Controller control={form.control} name="amount" render={({ field }) => <MoneyInput id="b-amount" value={field.value} onChange={field.onChange} currency={currency} locale={locale} />} />
      </FormField>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Category limits <span className="font-normal text-muted-foreground">(optional)</span></p>
          <Button type="button" size="sm" variant="outline" onClick={() => lines.append({ categoryId: "", amount: "" })}><Plus /> Add category</Button>
        </div>
        {lines.fields.length === 0 && <p className="text-xs text-muted-foreground">Add categories to track specific spending. A parent category includes its subcategories.</p>}
        {lines.fields.map((f, i) => (
          <div key={f.id} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
            <Controller
              control={form.control}
              name={`lines.${i}.categoryId`}
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full" aria-label={`Category ${i + 1}`} aria-invalid={Boolean(e.lines?.[i]?.categoryId)}><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {grouped.map(({ parent, children }) => (
                      <SelectGroup key={parent.id}>
                        <SelectItem value={parent.id}>{parent.name}</SelectItem>
                        {children.map((c) => <SelectItem key={c.id} value={c.id} className="pl-7">{c.name}</SelectItem>)}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <Controller control={form.control} name={`lines.${i}.amount`} render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} currency={currency} locale={locale} aria-invalid={Boolean(e.lines?.[i]?.amount)} />} />
            <Button type="button" size="icon" variant="ghost" onClick={() => lines.remove(i)} aria-label={`Remove category ${i + 1}`}><Trash2 /></Button>
          </div>
        ))}
        {e.lines?.message && <p className="text-sm text-destructive">{e.lines.message}</p>}
        {watchedLines.length > 0 && <p className="text-xs text-muted-foreground">Category limits total: <span className="tabular">{linesTotal.toFixed()}</span></p>}
      </div>

      <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
        <div>
          <p className="text-sm font-medium">Budget alerts</p>
          <p className="text-xs text-muted-foreground">Notify me when usage crosses my thresholds (set in Settings).</p>
        </div>
        <Controller control={form.control} name="alertsEnabled" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Budget alerts" />} />
      </div>
      <FormField id="b-notes" label="Notes">
        <Textarea id="b-notes" rows={2} maxLength={500} {...form.register("notes")} />
      </FormField>
      <FormRootError message={e.root?.message} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending && <LoaderCircle className="animate-spin" />}{budgetId ? "Save changes" : "Create budget"}</Button>
      </div>
    </form>
  );
}
