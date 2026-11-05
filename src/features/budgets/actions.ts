"use server";

import { refresh } from "next/cache";
import { runAction } from "@/lib/action";
import { requireUser } from "@/lib/dal";
import { createBudget, deleteBudget, updateBudget } from "./service";

export async function createBudgetAction(input: unknown) {
  const user = await requireUser();
  const r = await runAction(async () => (await createBudget(user.id, input)).id, "Budget created");
  if (r.ok) refresh();
  return r;
}

export async function updateBudgetAction(id: string, input: unknown) {
  const user = await requireUser();
  const r = await runAction(async () => (await updateBudget(user.id, id, input)).id, "Budget updated");
  if (r.ok) refresh();
  return r;
}

export async function deleteBudgetAction(id: string) {
  const user = await requireUser();
  const r = await runAction(() => deleteBudget(user.id, id), "Budget deleted");
  if (r.ok) refresh();
  return r;
}
