import { apiRoute, readJson } from "@/lib/api";
import { createGoal, listGoalsWithProgress } from "@/features/goals/service";

export const GET = apiRoute(async ({ user }) => ({ goals: await listGoalsWithProgress(user.id) }));

export const POST = apiRoute(async ({ request, user }) => Response.json(await createGoal(user.id, await readJson(request)), { status: 201 }));
