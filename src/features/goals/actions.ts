"use server";

import { refresh } from "next/cache";
import { runAction } from "@/lib/action";
import { requireUser } from "@/lib/dal";
import { addContribution, createGoal, deleteContribution, deleteGoal, updateGoal } from "./service";

export async function createGoalAction(input: unknown) {
  const user = await requireUser();
  const r = await runAction(async () => (await createGoal(user.id, input)).id, "Goal created");
  if (r.ok) refresh();
  return r;
}

export async function updateGoalAction(id: string, input: unknown) {
  const user = await requireUser();
  const r = await runAction(() => updateGoal(user.id, id, input), "Goal updated");
  if (r.ok) refresh();
  return r;
}

export async function deleteGoalAction(id: string) {
  const user = await requireUser();
  const r = await runAction(() => deleteGoal(user.id, id), "Goal deleted");
  if (r.ok) refresh();
  return r;
}

export async function addContributionAction(goalId: string, input: unknown) {
  const user = await requireUser();
  const type = (input as { type?: string })?.type;
  const r = await runAction(async () => void (await addContribution(user.id, goalId, input)), type === "WITHDRAWAL" ? "Withdrawal recorded" : "Contribution added");
  if (r.ok) refresh();
  return r;
}

export async function deleteContributionAction(id: string) {
  const user = await requireUser();
  const r = await runAction(() => deleteContribution(user.id, id), "Entry removed");
  if (r.ok) refresh();
  return r;
}
