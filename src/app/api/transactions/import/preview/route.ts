import { apiRoute, readJson } from "@/lib/api";
import { previewImport } from "@/features/import/service";

/** Validates rows and flags duplicates without importing anything. */
export const POST = apiRoute(async ({ request, user }) => previewImport(user.id, await readJson(request)));
