"use client";

import { useOpenFromQuery } from "@/components/shared/use-open-from-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Ellipsis, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { FormField, applyFieldErrors } from "@/components/shared/form";
import { useFormat } from "@/components/shared/format-context";
import { MoneyInput } from "@/components/shared/money-input";
import { useServerAction } from "@/components/shared/use-action";
import type { AccountOption } from "@/components/transactions/types";
import { addContributionAction, deleteContributionAction, deleteGoalAction } from "@/features/goals/actions";
import type { GoalInput } from "@/features/goals/schemas";
import { GoalForm } from "./goal-form";

export function NewGoalButton({ accounts }: { accounts: AccountOption[] }) {
  const [open, setOpen] = useOpenFromQuery();
  const f = useFormat();
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> New goal</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New financial goal</DialogTitle>
            <DialogDescription>Track savings toward something that matters to you.</DialogDescription>
          </DialogHeader>
          {open && <GoalForm accounts={accounts} currency={f.currency} locale={f.locale} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

type ContributionValues = { amount: string; date: string; note: string };

export function ContributionDialog({ goalId, goalName, type, max, today }: { goalId: string; goalName: string; type: "CONTRIBUTION" | "WITHDRAWAL"; max?: string; today: string }) {
  const [open, setOpen] = useState(false);
  const f = useFormat();
  const { pending, run } = useServerAction();
  const form = useForm<ContributionValues>({ defaultValues: { amount: "", date: today, note: "" } });
  const withdraw = type === "WITHDRAWAL";
  const submit = form.handleSubmit(async (values) => {
    await run(() => addContributionAction(goalId, { ...values, type }), { onSuccess: () => { setOpen(false); form.reset(); }, onError: (r) => applyFieldErrors(form, r.fieldErrors) });
  });
  return (
    <>
      <Button size="sm" variant={withdraw ? "ghost" : "outline"} onClick={() => setOpen(true)} disabled={withdraw && (!max || Number(max) <= 0)}>
        {withdraw ? <Minus /> : <Plus />} {withdraw ? "Withdraw" : "Add money"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{withdraw ? "Withdraw from" : "Contribute to"} {goalName}</DialogTitle>
            <DialogDescription>
              {withdraw ? `Up to ${f.money(max ?? 0)} available.` : "Records progress toward the goal."} Contributions earmark money; they don&apos;t move balances between accounts.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <FormField id="c-amount" label="Amount" error={form.formState.errors.amount?.message} required>
              <Controller control={form.control} name="amount" rules={{ required: "Enter an amount" }} render={({ field }) => <MoneyInput id="c-amount" value={field.value} onChange={field.onChange} currency={f.currency} locale={f.locale} autoFocus />} />
            </FormField>
            <FormField id="c-date" label="Date" error={form.formState.errors.date?.message}>
              <Input id="c-date" type="date" {...form.register("date")} />
            </FormField>
            <FormField id="c-note" label="Note">
              <Input id="c-note" maxLength={200} {...form.register("note")} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{withdraw ? "Withdraw" : "Add contribution"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function GoalMenu({ goalId, name, initial, accounts }: { goalId: string; name: string; initial: Partial<GoalInput>; accounts: AccountOption[] }) {
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
          <DialogHeader>
            <DialogTitle>Edit goal</DialogTitle>
            <DialogDescription>{name}</DialogDescription>
          </DialogHeader>
          {mode === "edit" && <GoalForm goalId={goalId} initial={initial} accounts={accounts} currency={f.currency} locale={f.locale} onDone={() => setMode(null)} />}
        </DialogContent>
      </Dialog>
      <ConfirmationDialog open={mode === "delete"} onOpenChange={(o) => !o && setMode(null)} title={`Delete ${name}?`} description="The goal and its contribution history will be removed." confirmLabel="Delete" destructive onConfirm={() => deleteGoalAction(goalId)} />
    </>
  );
}

export function RemoveContributionButton({ id }: { id: string }) {
  return (
    <ConfirmationDialog
      trigger={<Button variant="ghost" size="icon-xs" aria-label="Remove entry"><Trash2 /></Button>}
      title="Remove this entry?"
      description="The goal balance will be recalculated."
      confirmLabel="Remove"
      destructive
      onConfirm={() => deleteContributionAction(id)}
    />
  );
}
