import { apiRoute, readJson } from "@/lib/api";
import { createBudget, getBudgetOverview } from "@/features/budgets/service";

export const GET = apiRoute(async ({ user }) => ({ budgets: await getBudgetOverview(user.id) }));

export const POST = apiRoute(async ({ request, user }) => Response.json(await createBudget(user.id, await readJson(request)), { status: 201 }));
