"use server";

import { refresh } from "next/cache";
import { runAction } from "@/lib/action";
import { requireUser } from "@/lib/dal";
import { createAccount, deleteAccount, reconcileAccount, setAccountArchived, updateAccount } from "./service";

export async function createAccountAction(input: unknown) {
  const user = await requireUser();
  const r = await runAction(async () => (await createAccount(user.id, input)).id, "Account created");
  if (r.ok) refresh();
  return r;
}

export async function updateAccountAction(id: string, input: unknown) {
  const user = await requireUser();
  const r = await runAction(async () => (await updateAccount(user.id, id, input)).id, "Account updated");
  if (r.ok) refresh();
  return r;
}

export async function archiveAccountAction(id: string, archived: boolean) {
  const user = await requireUser();
  const r = await runAction(async () => void (await setAccountArchived(user.id, id, archived)), archived ? "Account archived" : "Account restored");
  if (r.ok) refresh();
  return r;
}

export async function deleteAccountAction(id: string) {
  const user = await requireUser();
  const r = await runAction(() => deleteAccount(user.id, id), "Account deleted");
  if (r.ok) refresh();
  return r;
}

export async function reconcileAccountAction(id: string, input: unknown) {
  const user = await requireUser();
  const r = await runAction(() => reconcileAccount(user.id, id, input), "Account reconciled");
  if (r.ok) refresh();
  return r;
}
