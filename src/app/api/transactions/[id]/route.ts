import { apiRoute, readJson } from "@/lib/api";
import { deleteTransaction, getTransaction, updateTransaction } from "@/features/transactions/service";
import { toTransactionRow } from "@/features/transactions/serialize";

type Params = { id: string };

export const GET = apiRoute<Params>(async ({ user, params }) => toTransactionRow(await getTransaction(user.id, params.id)));

export const PATCH = apiRoute<Params>(async ({ request, user, params }) => {
  await updateTransaction(user.id, params.id, await readJson(request));
  return toTransactionRow(await getTransaction(user.id, params.id));
});

export const DELETE = apiRoute<Params>(async ({ user, params }) => {
  await deleteTransaction(user.id, params.id);
  return new Response(null, { status: 204 });
});
