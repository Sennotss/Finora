import { create } from "zustand";
import type { TransactionInput } from "@/features/transactions/schemas";

type QuickAddState = {
  open: boolean;
  defaults: Partial<TransactionInput>;
  openWith: (defaults?: Partial<TransactionInput>) => void;
  setOpen: (open: boolean) => void;
};

/** Global quick-add transaction dialog, reachable from anywhere in the app. */
export const useQuickAdd = create<QuickAddState>((set) => ({
  open: false,
  defaults: {},
  openWith: (defaults = {}) => set({ open: true, defaults }),
  setOpen: (open) => set((s) => ({ open, defaults: open ? s.defaults : {} })),
}));
