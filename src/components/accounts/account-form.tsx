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
import { AppIcon } from "@/components/shared/icon";
import { MoneyInput } from "@/components/shared/money-input";
import { useServerAction } from "@/components/shared/use-action";
import { createAccountAction, updateAccountAction } from "@/features/accounts/actions";
import { ACCOUNT_ICONS, ACCOUNT_TYPES, accountInputSchema, type AccountInput } from "@/features/accounts/schemas";
import { ACCOUNT_TYPE_LABELS, isLiabilityAccount, type AccountTypeValue } from "@/features/finance/types";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { D } from "@/lib/money";

const negate = (v: string) => (D(v).isZero() ? "0" : D(v).negated().toFixed());

const DEFAULT_ICON: Record<AccountTypeValue, (typeof ACCOUNT_ICONS)[number]> = {
  CASH: "banknote",
  BANK: "landmark",
  E_WALLET: "smartphone",
  SAVINGS: "piggy-bank",
  INVESTMENT: "trending-up",
  CREDIT_CARD: "credit-card",
  LOAN: "hand-coins",
  OTHER: "wallet",
};

/**
 * For liabilities the user enters the amount owed (positive); it is stored as a negative
 * opening balance so that net worth = sum of balances holds everywhere.
 */
export function AccountForm({ accountId, initial, locale, baseCurrency, today, hasTransactions = false, onDone }: { accountId?: string; initial?: Partial<AccountInput>; locale: string; baseCurrency: string; today: string; hasTransactions?: boolean; onDone?: () => void }) {
  const { pending, run } = useServerAction();
  const initialType = (initial?.type ?? "BANK") as AccountTypeValue;
  const initialOpening = initial?.openingBalance ?? "0";
  const form = useForm<AccountInput>({
    resolver: zodResolver(accountInputSchema) as never,
    defaultValues: {
      name: "",
      type: initialType,
      currency: baseCurrency,
      openingDate: today,
      institution: "",
      color: "#2a78d6",
      icon: DEFAULT_ICON[initialType],
      creditLimit: "",
      notes: "",
      ...initial,
      openingBalance: isLiabilityAccount(initialType) ? negate(initialOpening) : initialOpening,
    },
  });
  const type = form.watch("type") as AccountTypeValue;
  const currency = form.watch("currency");
  const liability = isLiabilityAccount(type);
  const e = form.formState.errors;

  const submit = form.handleSubmit(async () => {
    const values = form.getValues();
    const opening = values.openingBalance || "0";
    const payload = { ...values, openingBalance: liability ? negate(opening) : opening };
    await run(() => (accountId ? updateAccountAction(accountId, payload) : createAccountAction(payload)), {
      onSuccess: () => onDone?.(),
      onError: (r) => applyFieldErrors(form, r.fieldErrors),
    });
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="acc-name" label="Account name" error={e.name?.message} required>
          <Input id="acc-name" placeholder="e.g. BCA Payroll" maxLength={60} {...form.register("name")} aria-invalid={Boolean(e.name)} />
        </FormField>
        <FormField id="acc-type" label="Type" required>
          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  form.setValue("icon", DEFAULT_ICON[v as AccountTypeValue]);
                }}
              >
                <SelectTrigger id="acc-type" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="acc-currency" label="Currency" error={e.currency?.message} description={hasTransactions ? "Locked once the account has transactions." : undefined}>
          <Controller
            control={form.control}
            name="currency"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={hasTransactions}>
                <SelectTrigger id="acc-currency" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <FormField id="acc-institution" label="Institution" error={e.institution?.message}>
          <Input id="acc-institution" placeholder="e.g. Bank Central Asia" maxLength={80} {...form.register("institution")} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="acc-opening" label={liability ? "Amount owed at start" : "Opening balance"} error={e.openingBalance?.message} description={liability ? "Enter what you owed on the opening date." : "Balance on the opening date."}>
          <Controller
            control={form.control}
            name="openingBalance"
            render={({ field }) => <MoneyInput id="acc-opening" value={field.value} onChange={field.onChange} currency={currency} locale={locale} allowNegative={!liability} />}
          />
        </FormField>
        <FormField id="acc-opening-date" label="Opening date" error={e.openingDate?.message} required>
          <Input id="acc-opening-date" type="date" {...form.register("openingDate")} />
        </FormField>
      </div>
      {liability && (
        <FormField id="acc-limit" label={type === "LOAN" ? "Original loan amount" : "Credit limit"} error={e.creditLimit?.message}>
          <Controller control={form.control} name="creditLimit" render={({ field }) => <MoneyInput id="acc-limit" value={field.value ?? ""} onChange={field.onChange} currency={currency} locale={locale} />} />
        </FormField>
      )}
      <FormField id="acc-color" label="Colour">
        <Controller control={form.control} name="color" render={({ field }) => <ColorPicker id="acc-color" value={field.value} onChange={field.onChange} />} />
      </FormField>
      <FormField id="acc-icon" label="Icon">
        <Controller
          control={form.control}
          name="icon"
          render={({ field }) => (
            <div id="acc-icon" role="radiogroup" aria-label="Icon" className="flex flex-wrap gap-1.5">
              {ACCOUNT_ICONS.map((i) => (
                <button key={i} type="button" role="radio" aria-checked={field.value === i} aria-label={i} onClick={() => field.onChange(i)} className={`flex size-8 items-center justify-center rounded-lg border ${field.value === i ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
                  <AppIcon name={i} className="size-4" />
                </button>
              ))}
            </div>
          )}
        />
      </FormField>
      <FormField id="acc-notes" label="Notes">
        <Textarea id="acc-notes" rows={2} maxLength={500} {...form.register("notes")} />
      </FormField>
      <FormRootError message={e.root?.message} />
      <div className="flex justify-end gap-2">
        {onDone && <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>}
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" />}
          {accountId ? "Save changes" : "Create account"}
        </Button>
      </div>
    </form>
  );
}
