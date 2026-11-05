import "server-only";
import { z } from "zod";
import { db, type TxClient } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { colorSchema, optionalId } from "@/lib/validation";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "./defaults";

export async function createDefaultCategories(tx: TxClient, userId: string) {
  for (const [kind, list] of [
    ["INCOME", DEFAULT_INCOME_CATEGORIES],
    ["EXPENSE", DEFAULT_EXPENSE_CATEGORIES],
  ] as const) {
    for (const c of list) {
      const parent = await tx.category.create({ data: { userId, name: c.name, kind, color: c.color, icon: c.icon } });
      if (c.children?.length) {
        await tx.category.createMany({
          data: c.children.map((name) => ({ userId, name, kind, color: c.color, icon: c.icon, parentId: parent.id })),
        });
      }
    }
  }
}

export async function listCategories(userId: string) {
  return db.category.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    select: { id: true, name: true, kind: true, parentId: true, color: true, icon: true },
  });
}

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(50),
  kind: z.enum(["INCOME", "EXPENSE"]),
  parentId: optionalId,
  color: colorSchema,
  icon: z.string().trim().min(1).max(40).default("tag"),
});

export type CategoryInput = z.input<typeof categoryInputSchema>;

async function assertValidParent(userId: string, parentId: string | null, kind: "INCOME" | "EXPENSE", selfId?: string) {
  if (!parentId) return;
  if (parentId === selfId) throw new AppError("A category cannot be its own parent", 422, { parentId: ["Invalid parent"] });
  const parent = await db.category.findFirst({ where: { id: parentId, userId, deletedAt: null } });
  if (!parent) throw new AppError("Parent category not found", 422, { parentId: ["Parent category not found"] });
  if (parent.kind !== kind) throw new AppError("Parent must be the same kind", 422, { parentId: ["Parent must be the same kind"] });
  // Keep the tree two levels deep (category → subcategory).
  if (parent.parentId) throw new AppError("Subcategories cannot have their own subcategories", 422, { parentId: ["Choose a top-level category"] });
}

async function assertUniqueName(userId: string, name: string, kind: string, parentId: string | null, excludeId?: string) {
  const clash = await db.category.findFirst({
    where: { userId, deletedAt: null, kind: kind as "INCOME" | "EXPENSE", parentId, name: { equals: name, mode: "insensitive" }, NOT: excludeId ? { id: excludeId } : undefined },
  });
  if (clash) throw new AppError("A category with this name already exists", 422, { name: ["Already exists"] });
}

export async function createCategory(userId: string, raw: unknown) {
  const input = categoryInputSchema.parse(raw);
  await assertValidParent(userId, input.parentId, input.kind);
  await assertUniqueName(userId, input.name, input.kind, input.parentId);
  return db.category.create({ data: { ...input, userId } });
}

export async function updateCategory(userId: string, id: string, raw: unknown) {
  const existing = await db.category.findFirst({ where: { id, userId, deletedAt: null }, include: { children: { where: { deletedAt: null }, select: { id: true } } } });
  if (!existing) throw new NotFoundError("Category");
  const input = categoryInputSchema.parse({ ...raw as object, kind: existing.kind });
  if (input.parentId && existing.children.length > 0) throw new AppError("This category has subcategories and cannot become a subcategory", 422, { parentId: ["Has subcategories"] });
  await assertValidParent(userId, input.parentId, existing.kind, id);
  await assertUniqueName(userId, input.name, existing.kind, input.parentId, id);
  return db.category.update({ where: { id }, data: { name: input.name, parentId: input.parentId, color: input.color, icon: input.icon } });
}

/** Soft delete: past transactions keep their category for history; subcategories move up a level. */
export async function deleteCategory(userId: string, id: string) {
  const existing = await db.category.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) throw new NotFoundError("Category");
  await db.$transaction([
    db.category.updateMany({ where: { userId, parentId: id }, data: { parentId: existing.parentId } }),
    db.budgetCategory.deleteMany({ where: { categoryId: id, budget: { userId } } }),
    db.category.update({ where: { id }, data: { deletedAt: new Date() } }),
  ]);
}
