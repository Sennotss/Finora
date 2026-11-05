"use server";

import { refresh } from "next/cache";
import { runAction } from "@/lib/action";
import { requireUser } from "@/lib/dal";
import { listCategories } from "@/features/categories/service";
import { suggestCategory } from "@/features/insights/categorize";
import { bulkTransactions, categorizationHistory, createTransaction, deleteTransaction, restoreTransaction, updateTransaction } from "./service";

export async function createTransactionAction(input: unknown) {
  const user = await requireUser();
  const result = await runAction(async () => (await createTransaction(user.id, input)).id, "Transaction added");
  if (result.ok) refresh();
  return result;
}

export async function updateTransactionAction(id: string, input: unknown) {
  const user = await requireUser();
  const result = await runAction(async () => (await updateTransaction(user.id, id, input)).id, "Transaction updated");
  if (result.ok) refresh();
  return result;
}

export async function deleteTransactionAction(id: string) {
  const user = await requireUser();
  const result = await runAction(() => deleteTransaction(user.id, id), "Transaction deleted");
  if (result.ok) refresh();
  return result;
}

export async function restoreTransactionAction(id: string) {
  const user = await requireUser();
  const result = await runAction(() => restoreTransaction(user.id, id), "Transaction restored");
  if (result.ok) refresh();
  return result;
}

export async function bulkTransactionAction(input: unknown) {
  const user = await requireUser();
  const result = await runAction(() => bulkTransactions(user.id, input));
  if (result.ok) refresh();
  return result;
}

export async function suggestCategoryAction(description: string, type: "INCOME" | "EXPENSE") {
  const user = await requireUser();
  if (typeof description !== "string" || description.trim().length < 2 || description.length > 200) return null;
  if (type !== "INCOME" && type !== "EXPENSE") return null;
  const [history, categories] = await Promise.all([categorizationHistory(user.id), listCategories(user.id)]);
  return suggestCategory(description, type, history, categories);
}
