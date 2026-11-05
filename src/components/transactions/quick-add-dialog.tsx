"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuickAdd } from "@/stores/quick-add";
import type { TransactionInput } from "@/features/transactions/schemas";
import { TransactionForm } from "./transaction-form";
import type { AccountOption, CategoryOption } from "./types";

export function QuickAddButton({ label = "Add transaction", defaults, variant = "default", className }: { label?: string; defaults?: Partial<TransactionInput>; variant?: "default" | "outline"; className?: string }) {
  const openWith = useQuickAdd((s) => s.openWith);
  return (
    <Button variant={variant} onClick={() => openWith(defaults)} className={className}>
      <Plus aria-hidden />
      <span className="max-sm:sr-only">{label}</span>
    </Button>
  );
}

/** Global quick-add dialog mounted once in the dashboard layout. */
export function QuickAddDialog({ accounts, categories, locale, today }: { accounts: AccountOption[]; categories: CategoryOption[]; locale: string; today: string }) {
  const { open, defaults, setOpen } = useQuickAdd();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{defaults.type === "TRANSFER" ? "New transfer" : "New transaction"}</DialogTitle>
          <DialogDescription>Record income, an expense or a transfer between your accounts.</DialogDescription>
        </DialogHeader>
        {open && <TransactionForm accounts={accounts} categories={categories} locale={locale} today={today} initial={defaults} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
