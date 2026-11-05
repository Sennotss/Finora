"use server";

import { refresh } from "next/cache";
import { signOut } from "@/lib/auth";
import { runAction } from "@/lib/action";
import { requireUser } from "@/lib/dal";
import { createCategory, deleteCategory, updateCategory } from "@/features/categories/service";
import { changePassword, createTag, deleteExchangeRate, deleteTag, deleteUserAccount, saveExchangeRate, updatePreferences, updateProfile } from "./service";

async function act<T>(fn: (userId: string) => Promise<T>, message: string) {
  const user = await requireUser();
  const r = await runAction(() => fn(user.id), message);
  if (r.ok) refresh();
  return r;
}

export async function updateProfileAction(input: unknown) {
  return act((id) => updateProfile(id, input), "Profile updated");
}

export async function changePasswordAction(input: unknown) {
  const user = await requireUser();
  const r = await runAction(() => changePassword(user.id, input), "Password changed");
  if (r.ok) await signOut({ redirectTo: "/login?reason=password-changed" });
  return r;
}

export async function updatePreferencesAction(input: unknown) {
  return act((id) => updatePreferences(id, input), "Preferences saved");
}

export async function saveExchangeRateAction(input: unknown) {
  return act((id) => saveExchangeRate(id, input), "Exchange rate saved");
}

export async function deleteExchangeRateAction(rateId: string) {
  return act((id) => deleteExchangeRate(id, rateId), "Exchange rate removed");
}

export async function createCategoryAction(input: unknown) {
  return act(async (id) => void (await createCategory(id, input)), "Category created");
}

export async function updateCategoryAction(categoryId: string, input: unknown) {
  return act(async (id) => void (await updateCategory(id, categoryId, input)), "Category updated");
}

export async function deleteCategoryAction(categoryId: string) {
  return act((id) => deleteCategory(id, categoryId), "Category deleted");
}

export async function createTagAction(input: unknown) {
  return act((id) => createTag(id, input), "Tag created");
}

export async function deleteTagAction(tagId: string) {
  return act((id) => deleteTag(id, tagId), "Tag deleted");
}

export async function deleteUserAccountAction(input: unknown) {
  const user = await requireUser();
  const r = await runAction(() => deleteUserAccount(user.id, input));
  if (r.ok) await signOut({ redirectTo: "/register" });
  return r;
}
