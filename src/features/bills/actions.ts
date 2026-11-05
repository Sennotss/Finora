"use server";

import { refresh } from "next/cache";
import { runAction } from "@/lib/action";
import { requireUser } from "@/lib/dal";
import { createBill, deleteBill, payBill, undoLastPayment, updateBill } from "./service";
import { createRecurring, deleteRecurring, generateRecurringForTemplate, updateRecurring } from "@/features/recurring/service";

export async function createBillAction(input: unknown) {
  const user = await requireUser();
  const r = await runAction(async () => (await createBill(user.id, input)).id, "Bill created");
  if (r.ok) refresh();
  return r;
}

export async function updateBillAction(id: string, input: unknown) {
  const user = await requireUser();
  const r = await runAction(() => updateBill(user.id, id, input), "Bill updated");
  if (r.ok) refresh();
  return r;
}

export async function deleteBillAction(id: string) {
  const user = await requireUser();
  const r = await runAction(() => deleteBill(user.id, id), "Bill deleted");
  if (r.ok) refresh();
  return r;
}

export async function payBillAction(id: string, input: unknown) {
  const user = await requireUser();
  const r = await runAction(() => payBill(user.id, id, input), "Marked as paid");
  if (r.ok) refresh();
  return r;
}

export async function undoBillPaymentAction(id: string) {
  const user = await requireUser();
  const r = await runAction(() => undoLastPayment(user.id, id), "Payment undone");
  if (r.ok) refresh();
  return r;
}

export async function createRecurringAction(input: unknown) {
  const user = await requireUser();
  const r = await runAction(async () => {
    const template = await createRecurring(user.id, input);
    return generateRecurringForTemplate(user.id, template.id);
  }, "Recurring transaction saved");
  if (r.ok) refresh();
  return r;
}

export async function updateRecurringAction(id: string, input: unknown) {
  const user = await requireUser();
  const r = await runAction(async () => {
    await updateRecurring(user.id, id, input);
    return generateRecurringForTemplate(user.id, id);
  }, "Recurring transaction updated");
  if (r.ok) refresh();
  return r;
}

export async function deleteRecurringAction(id: string) {
  const user = await requireUser();
  const r = await runAction(() => deleteRecurring(user.id, id), "Recurring transaction deleted");
  if (r.ok) refresh();
  return r;
}
