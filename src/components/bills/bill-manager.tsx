"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { CheckCircle2, Ellipsis, ExternalLink, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { FormField, applyFieldErrors } from "@/components/shared/form";
import { useFormat } from "@/components/shared/format-context";
import { MoneyInput } from "@/components/shared/money-input";
import { useServerAction } from "@/components/shared/use-action";
import type { AccountOption, CategoryOption } from "@/components/transactions/types";
import { deleteBillAction, deleteRecurringAction, payBillAction, undoBillPaymentAction } from "@/features/bills/actions";
import type { BillInput, RecurringInput } from "@/features/bills/schemas";
import { BillForm, RecurringForm } from "./bill-forms";

type Shared = { accounts: AccountOption[]; categories: CategoryOption[]; today: string };

export function NewBillButton({ accounts, categories, today }: Shared) {
  const [open, setOpen] = useState(false);
  const f = useFormat();
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> Add bill</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New bill or subscription</DialogTitle>
            <DialogDescription>You&apos;ll get reminders before it&apos;s due and can mark it paid in one click.</DialogDescription>
          </DialogHeader>
          {open && <BillForm accounts={accounts} categories={categories} baseCurrency={f.currency} locale={f.locale} today={today} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function NewRecurringButton({ accounts, categories, today }: Shared) {
  const [open, setOpen] = useState(false);
  const f = useFormat();
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Plus /> Recurring transaction</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New recurring transaction</DialogTitle>
            <DialogDescription>Posted automatically on schedule — for salary, standing transfers or fixed charges.</DialogDescription>
          </DialogHeader>
          {open && <RecurringForm accounts={accounts} categories={categories} locale={f.locale} today={today} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

type PayValues = { paidDate: string; amount: string; accountId: string; recordTransaction: boolean };


export function PayBillButton({ billId, name, amount, currency, accountId, dueDate, dueDateIso, accounts, today }: { billId: string; name: string; amount: string; currency: string; accountId: string | null; dueDate: string; dueDateIso: string; accounts: AccountOption[]; today: string }) {
  const [open, setOpen] = useState(false);
  const f = useFormat();
  const { pending, run } = useServerAction();
  const form = useForm<PayValues>({ defaultValues: { paidDate: today, amount, accountId: accountId ?? accounts[0]?.id ?? "", recordTransaction: true } });
  const record = form.watch("recordTransaction");
  const submit = form.handleSubmit(async (values) => {
    await run(() => payBillAction(billId, { ...values, dueDate: dueDateIso }), { onSuccess: () => setOpen(false), onError: (r) => applyFieldErrors(form, r.fieldErrors) });
  });
  return (
    <>
      <Button size="sm" onClick={() => { form.reset({ paidDate: today, amount, accountId: accountId ?? accounts[0]?.id ?? "", recordTransaction: true }); setOpen(true); }}>
        <CheckCircle2 /> Mark paid
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay {name}</DialogTitle>
            <DialogDescription>Settles the bill due {dueDate}. The next due date is scheduled automatically.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="pay-amount" label="Amount paid" error={form.formState.errors.amount?.message}>
                <Controller control={form.control} name="amount" render={({ field }) => <MoneyInput id="pay-amount" value={field.value} onChange={field.onChange} currency={currency} locale={f.locale} />} />
              </FormField>
              <FormField id="pay-date" label="Paid on" error={form.formState.errors.paidDate?.message}>
                <Input id="pay-date" type="date" {...form.register("paidDate")} />
              </FormField>
            </div>
            <label className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm">
              Record as an expense transaction
              <Controller control={form.control} name="recordTransaction" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
            </label>
            {record && (
              <FormField id="pay-account" label="Paid from" error={form.formState.errors.accountId?.message}>
                <Controller control={form.control} name="accountId" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="pay-account" className="w-full"><SelectValue placeholder="Choose account" /></SelectTrigger>
                    <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} · {a.currency}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </FormField>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>Confirm payment</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function BillMenu({ billId, name, url, hasPayments, initial, ...shared }: Shared & { billId: string; name: string; url: string | null; hasPayments: boolean; initial: Partial<BillInput> }) {
  const [mode, setMode] = useState<"edit" | "delete" | "undo" | null>(null);
  const f = useFormat();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`}><Ellipsis /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {url && <DropdownMenuItem asChild><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink /> Open payment link</a></DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => setMode("edit")}><Pencil /> Edit</DropdownMenuItem>
          {hasPayments && <DropdownMenuItem onSelect={() => setMode("undo")}><Undo2 /> Undo last payment</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setMode("delete")}><Trash2 /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={mode === "edit"} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Edit bill</DialogTitle><DialogDescription>{name}</DialogDescription></DialogHeader>
          {mode === "edit" && <BillForm billId={billId} initial={initial} {...shared} baseCurrency={f.currency} locale={f.locale} onDone={() => setMode(null)} />}
        </DialogContent>
      </Dialog>
      <ConfirmationDialog open={mode === "undo"} onOpenChange={(o) => !o && setMode(null)} title="Undo the last payment?" description="The due date goes back and the recorded expense (if any) is deleted." confirmLabel="Undo payment" onConfirm={() => undoBillPaymentAction(billId)} />
      <ConfirmationDialog open={mode === "delete"} onOpenChange={(o) => !o && setMode(null)} title={`Delete ${name}?`} description="Past payments and their transactions are kept." confirmLabel="Delete" destructive onConfirm={() => deleteBillAction(billId)} />
    </>
  );
}

export function RecurringMenu({ id, name, initial, ...shared }: Shared & { id: string; name: string; initial: Partial<RecurringInput> }) {
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const f = useFormat();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`}><Ellipsis /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setMode("edit")}><Pencil /> Edit</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setMode("delete")}><Trash2 /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={mode === "edit"} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Edit recurring transaction</DialogTitle><DialogDescription>Already-posted transactions are not changed.</DialogDescription></DialogHeader>
          {mode === "edit" && <RecurringForm recurringId={id} initial={initial} {...shared} locale={f.locale} onDone={() => setMode(null)} />}
        </DialogContent>
      </Dialog>
      <ConfirmationDialog open={mode === "delete"} onOpenChange={(o) => !o && setMode(null)} title={`Delete ${name}?`} description="No new transactions will be posted. Transactions already created are kept." confirmLabel="Delete" destructive onConfirm={() => deleteRecurringAction(id)} />
    </>
  );
}
