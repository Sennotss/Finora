"use client";

import { useOpenFromQuery } from "@/components/shared/use-open-from-query";
import { useState } from "react";
import { Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { useFormat } from "@/components/shared/format-context";
import type { CategoryOption } from "@/components/transactions/types";
import { deleteBudgetAction } from "@/features/budgets/actions";
import type { BudgetInput } from "@/features/budgets/schemas";
import { BudgetForm } from "./budget-form";

export function NewBudgetButton({ categories, today }: { categories: CategoryOption[]; today: string }) {
  const [open, setOpen] = useOpenFromQuery();
  const f = useFormat();
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> New budget</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New budget</DialogTitle>
            <DialogDescription>Set a spending limit for a week, month, year or a custom period.</DialogDescription>
          </DialogHeader>
          {open && <BudgetForm categories={categories} currency={f.currency} locale={f.locale} today={today} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function BudgetMenu({ budgetId, name, initial, categories, today }: { budgetId: string; name: string; initial: Partial<BudgetInput>; categories: CategoryOption[]; today: string }) {
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
            <DialogTitle>Edit budget</DialogTitle>
            <DialogDescription>{name}</DialogDescription>
          </DialogHeader>
          {mode === "edit" && <BudgetForm budgetId={budgetId} initial={initial} categories={categories} currency={f.currency} locale={f.locale} today={today} onDone={() => setMode(null)} />}
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        open={mode === "delete"}
        onOpenChange={(o) => !o && setMode(null)}
        title={`Delete ${name}?`}
        description="The budget is removed. Your transactions are not affected."
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteBudgetAction(budgetId)}
      />
    </>
  );
}
