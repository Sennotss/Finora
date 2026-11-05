import { apiRoute, readJson } from "@/lib/api";
import { commitImport } from "@/features/import/service";

/** Re-validates and imports valid rows atomically; returns a per-row report of skipped rows. */
export const POST = apiRoute(async ({ request, user }) => Response.json(await commitImport(user.id, await readJson(request)), { status: 201 }));
