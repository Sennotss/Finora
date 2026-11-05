"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FormField, FormRootError, applyFieldErrors } from "@/components/shared/form";
import { MoneyInput } from "@/components/shared/money-input";
import { useServerAction } from "@/components/shared/use-action";
import { groupCategories, type AccountOption, type CategoryOption } from "@/components/transactions/types";
import { createBillAction, createRecurringAction, updateBillAction, updateRecurringAction } from "@/features/bills/actions";
import { FREQUENCIES, billInputSchema, recurringInputSchema, type BillInput, type RecurringInput } from "@/features/bills/schemas";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/features/transactions/schemas";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { FREQUENCY_LABELS } from "@/lib/recurrence";

function CategorySelect({ id, value, onChange, categories, kind }: { id: string; value: string | null | undefined; onChange: (v: string) => void; categories: CategoryOption[]; kind: "INCOME" | "EXPENSE" }) {
  return (
    <Select value={value || "none"} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value="none">Uncategorised</SelectItem>
        {groupCategories(categories, kind).map(({ parent, children }) => (
          <SelectGroup key={parent.id}>
            <SelectItem value={parent.id}>{parent.name}</SelectItem>
            {children.map((c) => <SelectItem key={c.id} value={c.id} className="pl-7">{c.name}</SelectItem>)}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function FrequencyFields({ control, register, frequency, error }: { control: never; register: (n: "interval") => object; frequency: string; error?: string }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormField id="freq" label="Repeats" required>
        <Controller
          control={control}
          name={"frequency" as never}
          render={({ field }) => (
            <Select value={field.value as string} onValueChange={field.onChange}>
              <SelectTrigger id="freq" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f]}</SelectItem>)}</SelectContent>
            </Select>
          )}
        />
      </FormField>
      <FormField id="interval" label={frequency === "CUSTOM" ? "Every N days" : "Every N periods"} error={error}>
        <Input id="interval" type="number" min={1} max={365} {...register("interval")} />
      </FormField>
    </div>
  );
}

export function BillForm({ billId, initial, accounts, categories, baseCurrency, locale, today, onDone }: { billId?: string; initial?: Partial<BillInput>; accounts: AccountOption[]; categories: CategoryOption[]; baseCurrency: string; locale: string; today: string; onDone: () => void }) {
  const { pending, run } = useServerAction();
  const form = useForm<BillInput>({
    resolver: zodResolver(billInputSchema) as never,
    defaultValues: { name: "", amount: "", currency: baseCurrency, accountId: "none", categoryId: "none", frequency: "MONTHLY", interval: 1, nextDueDate: today, endDate: "", isSubscription: false, reminderDays: 3, isActive: true, url: "", notes: "", ...initial },
  });
  const e = form.formState.errors;
  const currency = form.watch("currency");
  const submit = form.handleSubmit(async () => {
    const values = form.getValues();
    await run<unknown>(() => (billId ? updateBillAction(billId, values) : createBillAction(values)), { onSuccess: onDone, onError: (r) => applyFieldErrors(form, r.fieldErrors) });
  });
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="bill-name" label="Name" error={e.name?.message} required>
          <Input id="bill-name" placeholder="e.g. Electricity (PLN)" maxLength={80} {...form.register("name")} />
        </FormField>
        <FormField id="bill-due" label="Next due date" error={e.nextDueDate?.message} required>
          <Input id="bill-due" type="date" {...form.register("nextDueDate")} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <FormField id="bill-amount" label="Amount" error={e.amount?.message} required description="Use your best estimate for variable bills.">
          <Controller control={form.control} name="amount" render={({ field }) => <MoneyInput id="bill-amount" value={field.value} onChange={field.onChange} currency={currency} locale={locale} />} />
        </FormField>
        <FormField id="bill-currency" label="Currency">
          <Controller control={form.control} name="currency" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="bill-currency" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{SUPPORTED_CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}</SelectContent>
            </Select>
          )} />
        </FormField>
      </div>
      <FrequencyFields control={form.control as never} register={form.register as never} frequency={form.watch("frequency")} error={e.interval?.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="bill-account" label="Pay from" error={e.accountId?.message}>
          <Controller control={form.control} name="accountId" render={({ field }) => (
            <Select value={field.value || "none"} onValueChange={field.onChange}>
              <SelectTrigger id="bill-account" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Choose when paying</SelectItem>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )} />
        </FormField>
        <FormField id="bill-category" label="Category" error={e.categoryId?.message}>
          <Controller control={form.control} name="categoryId" render={({ field }) => <CategorySelect id="bill-category" value={field.value} onChange={field.onChange} categories={categories} kind="EXPENSE" />} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="bill-end" label="Ends on" error={e.endDate?.message} description="Optional, e.g. the last loan instalment.">
          <Input id="bill-end" type="date" {...form.register("endDate")} />
        </FormField>
        <FormField id="bill-remind" label="Remind me (days before)" error={e.reminderDays?.message}>
          <Input id="bill-remind" type="number" min={0} max={30} {...form.register("reminderDays")} />
        </FormField>
      </div>
      <FormField id="bill-url" label="Payment link" error={e.url?.message}>
        <Input id="bill-url" type="url" placeholder="https://" {...form.register("url")} />
      </FormField>
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm"><Controller control={form.control} name="isSubscription" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} /> Subscription</label>
        <label className="flex items-center gap-2 text-sm"><Controller control={form.control} name="isActive" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} /> Active</label>
      </div>
      <FormField id="bill-notes" label="Notes">
        <Textarea id="bill-notes" rows={2} maxLength={500} {...form.register("notes")} />
      </FormField>
      <FormRootError message={e.root?.message} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending && <LoaderCircle className="animate-spin" />}{billId ? "Save changes" : "Add bill"}</Button>
      </div>
    </form>
  );
}

export function RecurringForm({ recurringId, initial, accounts, categories, locale, today, onDone }: { recurringId?: string; initial?: Partial<RecurringInput>; accounts: AccountOption[]; categories: CategoryOption[]; locale: string; today: string; onDone: () => void }) {
  const { pending, run } = useServerAction();
  const form = useForm<RecurringInput>({
    resolver: zodResolver(recurringInputSchema) as never,
    defaultValues: { description: "", type: "INCOME", amount: "", accountId: accounts[0]?.id ?? "", destinationAccountId: "", categoryId: "none", paymentMethod: "", frequency: "MONTHLY", interval: 1, startDate: today, endDate: "", isActive: true, notes: "", ...initial },
  });
  const e = form.formState.errors;
  const type = form.watch("type");
  const accountId = form.watch("accountId");
  const currency = accounts.find((a) => a.id === accountId)?.currency ?? "IDR";
  const submit = form.handleSubmit(async () => {
    const values = form.getValues();
    await run<unknown>(() => (recurringId ? updateRecurringAction(recurringId, values) : createRecurringAction(values)), { onSuccess: onDone, onError: (r) => applyFieldErrors(form, r.fieldErrors) });
  });
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Controller control={form.control} name="type" render={({ field }) => (
        <ToggleGroup type="single" variant="outline" value={field.value} onValueChange={(v) => v && (field.onChange(v), form.setValue("categoryId", "none"))} className="w-full" aria-label="Type">
          <ToggleGroupItem value="INCOME" className="flex-1">Income</ToggleGroupItem>
          <ToggleGroupItem value="EXPENSE" className="flex-1">Expense</ToggleGroupItem>
          <ToggleGroupItem value="TRANSFER" className="flex-1">Transfer</ToggleGroupItem>
        </ToggleGroup>
      )} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="r-desc" label="Description" error={e.description?.message} required>
          <Input id="r-desc" placeholder={type === "INCOME" ? "e.g. Salary" : type === "TRANSFER" ? "e.g. Monthly savings" : "e.g. Gym membership"} maxLength={200} {...form.register("description")} />
        </FormField>
        <FormField id="r-amount" label="Amount" error={e.amount?.message} required>
          <Controller control={form.control} name="amount" render={({ field }) => <MoneyInput id="r-amount" value={field.value} onChange={field.onChange} currency={currency} locale={locale} />} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="r-account" label={type === "TRANSFER" ? "From account" : "Account"} error={e.accountId?.message} required>
          <Controller control={form.control} name="accountId" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="r-account" className="w-full"><SelectValue placeholder="Choose account" /></SelectTrigger>
              <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          )} />
        </FormField>
        {type === "TRANSFER" ? (
          <FormField id="r-dest" label="To account" error={e.destinationAccountId?.message} required>
            <Controller control={form.control} name="destinationAccountId" render={({ field }) => (
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <SelectTrigger id="r-dest" className="w-full"><SelectValue placeholder="Choose account" /></SelectTrigger>
                <SelectContent>{accounts.filter((a) => a.id !== accountId).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </FormField>
        ) : (
          <FormField id="r-cat" label="Category" error={e.categoryId?.message}>
            <Controller control={form.control} name="categoryId" render={({ field }) => <CategorySelect id="r-cat" value={field.value} onChange={field.onChange} categories={categories} kind={type} />} />
          </FormField>
        )}
      </div>
      <FrequencyFields control={form.control as never} register={form.register as never} frequency={form.watch("frequency")} error={e.interval?.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="r-start" label="First occurrence" error={e.startDate?.message} required description="Past occurrences up to today are posted automatically, once.">
          <Input id="r-start" type="date" {...form.register("startDate")} />
        </FormField>
        <FormField id="r-end" label="Ends on" error={e.endDate?.message}>
          <Input id="r-end" type="date" {...form.register("endDate")} />
        </FormField>
      </div>
      {type !== "TRANSFER" && (
        <FormField id="r-method" label="Payment method">
          <Controller control={form.control} name="paymentMethod" render={({ field }) => (
            <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
              <SelectTrigger id="r-method" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not specified</SelectItem>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>)}
              </SelectContent>
            </Select>
          )} />
        </FormField>
      )}
      <label className="flex items-center gap-2 text-sm"><Controller control={form.control} name="isActive" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} /> Active</label>
      <FormRootError message={e.root?.message} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending && <LoaderCircle className="animate-spin" />}{recurringId ? "Save changes" : "Create"}</Button>
      </div>
    </form>
  );
}
