import { apiRoute, readJson } from "@/lib/api";
import { deleteGoal, updateGoal } from "@/features/goals/service";

type Params = { id: string };

export const PATCH = apiRoute<Params>(async ({ request, user, params }) => {
  await updateGoal(user.id, params.id, await readJson(request));
  return { ok: true };
});

export const DELETE = apiRoute<Params>(async ({ user, params }) => {
  await deleteGoal(user.id, params.id);
  return new Response(null, { status: 204 });
});
