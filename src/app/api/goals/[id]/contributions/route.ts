import { apiRoute, readJson } from "@/lib/api";
import { addContribution } from "@/features/goals/service";

/** POST { type: "CONTRIBUTION" | "WITHDRAWAL", amount, date, note? } */
export const POST = apiRoute<{ id: string }>(async ({ request, user, params }) => Response.json(await addContribution(user.id, params.id, await readJson(request)), { status: 201 }));
