import { apiRoute, readJson } from "@/lib/api";
import { deleteBudget, updateBudget } from "@/features/budgets/service";

type Params = { id: string };

export const PATCH = apiRoute<Params>(async ({ request, user, params }) => updateBudget(user.id, params.id, await readJson(request)));

export const DELETE = apiRoute<Params>(async ({ user, params }) => {
  await deleteBudget(user.id, params.id);
  return new Response(null, { status: 204 });
});
