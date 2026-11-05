export type AccountOption = { id: string; name: string; type: string; currency: string; color: string; icon: string };
export type CategoryOption = { id: string; name: string; kind: "INCOME" | "EXPENSE"; parentId: string | null; color: string; icon: string };

/** Serialisable transaction for client components (amounts as exact strings). */
export type TransactionRow = {
  id: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: string;
  destinationAmount: string | null;
  currency: string;
  date: string;
  description: string;
  merchant: string | null;
  notes: string | null;
  paymentMethod: string | null;
  isAdjustment: boolean;
  deleted: boolean;
  account: { id: string; name: string; color: string; currency: string };
  destinationAccount: { id: string; name: string; color: string; currency: string } | null;
  category: { id: string; name: string; color: string; icon: string; parentName: string | null } | null;
  tags: string[];
  receipt: { fileName: string; size: number; mimeType: string } | null;
  source: { kind: "bill" | "recurring"; label: string } | null;
  createdAt: string;
  updatedAt: string;
};

/** Groups categories as parent → children for selects, filtered by kind. */
export function groupCategories(categories: CategoryOption[], kind: "INCOME" | "EXPENSE") {
  const ofKind = categories.filter((c) => c.kind === kind);
  const parents = ofKind.filter((c) => !c.parentId || !ofKind.some((p) => p.id === c.parentId));
  return parents.map((p) => ({ parent: p, children: ofKind.filter((c) => c.parentId === p.id) }));
}
