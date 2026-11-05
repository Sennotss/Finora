"use server";

import { refresh } from "next/cache";
import { runAction } from "@/lib/action";
import { requireUser } from "@/lib/dal";
import { createJournalEntry, deleteJournalEntry, saveMonthlyReview, updateJournalEntry } from "./service";

export async function createJournalEntryAction(input: unknown) {
  const user = await requireUser();
  const r = await runAction(async () => (await createJournalEntry(user.id, input)).id, "Entry saved");
  if (r.ok) refresh();
  return r;
}

export async function updateJournalEntryAction(id: string, input: unknown) {
  const user = await requireUser();
  const r = await runAction(() => updateJournalEntry(user.id, id, input), "Entry updated");
  if (r.ok) refresh();
  return r;
}

export async function deleteJournalEntryAction(id: string) {
  const user = await requireUser();
  const r = await runAction(() => deleteJournalEntry(user.id, id), "Entry deleted");
  if (r.ok) refresh();
  return r;
}

export async function saveMonthlyReviewAction(input: unknown) {
  const user = await requireUser();
  const r = await runAction(async () => (await saveMonthlyReview(user.id, input)).id, "Monthly review saved");
  if (r.ok) refresh();
  return r;
}
