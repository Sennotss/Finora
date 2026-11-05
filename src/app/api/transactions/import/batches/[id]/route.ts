import { apiRoute } from "@/lib/api";
import { undoImport } from "@/features/import/service";

/** DELETE undoes an import by soft-deleting the transactions it created. */
export const DELETE = apiRoute<{ id: string }>(async ({ user, params }) => ({ removed: await undoImport(user.id, params.id) }));
