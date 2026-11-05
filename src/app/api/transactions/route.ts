import { apiRoute, readJson, searchParamsObject } from "@/lib/api";
import { createTransaction, getTransaction, listTransactions, parseFilters } from "@/features/transactions/service";
import { toTransactionRow } from "@/features/transactions/serialize";

/** GET /api/transactions — filterable, paginated list (same filters as the UI). */
export const GET = apiRoute(async ({ request, user }) => {
  const result = await listTransactions(user.id, parseFilters(searchParamsObject(request)));
  return { ...result, items: result.items.map(toTransactionRow) };
});

/** POST /api/transactions — create; body matches the transaction form. */
export const POST = apiRoute(async ({ request, user }) => {
  const created = await createTransaction(user.id, await readJson(request));
  return Response.json(toTransactionRow(await getTransaction(user.id, created.id)), { status: 201 });
});
