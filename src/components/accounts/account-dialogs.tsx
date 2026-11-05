"use client";

import { useOpenFromQuery } from "@/components/shared/use-open-from-query";
import { useState } from "react";
import { ArrowLeftRight, Plus, Scale } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField, applyFieldErrors } from "@/components/shared/form";
import { MoneyInput } from "@/components/shared/money-input";
import { useServerAction } from "@/components/shared/use-action";
import { useFormat } from "@/components/shared/format-context";
import { reconcileAccountAction } from "@/features/accounts/actions";
import type { AccountInput } from "@/features/accounts/schemas";
import { useQuickAdd } from "@/stores/quick-add";
import { AccountForm } from "./account-form";

export function NewAccountButton({ today }: { today: string }) {
  const [open, setOpen] = useOpenFromQuery();
  const f = useFormat();
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> New account</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New account</DialogTitle>
            <DialogDescription>Bank accounts, cash, e-wallets, savings, investments, credit cards or loans.</DialogDescription>
          </DialogHeader>
          {open && <AccountForm locale={f.locale} baseCurrency={f.currency} today={today} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EditAccountDialog({ accountId, initial, today, hasTransactions, trigger }: { accountId: string; initial: Partial<AccountInput>; today: string; hasTransactions: boolean; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const f = useFormat();
  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit account</DialogTitle>
            <DialogDescription>Changing the opening balance or date corrects every historical balance.</DialogDescription>
          </DialogHeader>
          {open && <AccountForm accountId={accountId} initial={initial} locale={f.locale} baseCurrency={f.currency} today={today} hasTransactions={hasTransactions} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TransferButton({ fromAccountId }: { fromAccountId: string }) {
  const openWith = useQuickAdd((s) => s.openWith);
  return (
    <Button variant="outline" onClick={() => openWith({ type: "TRANSFER", accountId: fromAccountId, description: "Transfer" })}>
      <ArrowLeftRight /> Transfer
    </Button>
  );
}

type ReconcileValues = { actualBalance: string; date: string; note: string };

/** Enter the real balance from your bank/app; the difference is posted as an adjustment. */
export function ReconcileDialog({ accountId, currency, recorded, today, liability }: { accountId: string; currency: string; recorded: string; today: string; liability: boolean }) {
  const [open, setOpen] = useState(false);
  const f = useFormat();
  const { pending, run } = useServerAction();
  const form = useForm<ReconcileValues>({ defaultValues: { actualBalance: recorded, date: today, note: "" } });

  const submit = form.handleSubmit(async (values) => {
    await run(() => reconcileAccountAction(accountId, values), {
      onSuccess: () => setOpen(false),
      onError: (r) => applyFieldErrors(form, r.fieldErrors),
    });
  });

  return (
    <>
      <Button variant="outline" onClick={() => { form.reset({ actualBalance: recorded, date: today, note: "" }); setOpen(true); }}>
        <Scale /> Reconcile
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reconcile balance</DialogTitle>
            <DialogDescription>
              Recorded balance: <strong className="tabular">{f.money(recorded, { currency })}</strong>. Enter the actual balance{liability ? " (negative when you owe money)" : ""}. Any difference is recorded as a balance adjustment, which is not counted as income or spending.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <FormField id="rec-balance" label="Actual balance" error={form.formState.errors.actualBalance?.message}>
              <Controller control={form.control} name="actualBalance" render={({ field }) => <MoneyInput id="rec-balance" value={field.value} onChange={field.onChange} currency={currency} locale={f.locale} allowNegative />} />
            </FormField>
            <FormField id="rec-date" label="As of" error={form.formState.errors.date?.message}>
              <Input id="rec-date" type="date" {...form.register("date")} />
            </FormField>
            <FormField id="rec-note" label="Note">
              <Input id="rec-note" maxLength={200} {...form.register("note")} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>Reconcile</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
