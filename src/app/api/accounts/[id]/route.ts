import { apiRoute, readJson } from "@/lib/api";
import { getUserContext } from "@/lib/dal";
import { accountBalanceAsOf, deleteAccount, setAccountArchived, updateAccount } from "@/features/accounts/service";

type Params = { id: string };

export const GET = apiRoute<Params>(async ({ user, params }) => {
  const ctx = await getUserContext(user.id);
  const { account, balance } = await accountBalanceAsOf(user.id, params.id, ctx.today);
  return { ...account, balance: balance.toFixed() };
});

/** PATCH with the full account form, or { archived: boolean } to archive/restore. */
export const PATCH = apiRoute<Params>(async ({ request, user, params }) => {
  const body = (await readJson(request)) as Record<string, unknown>;
  if (typeof body.archived === "boolean" && Object.keys(body).length === 1) return setAccountArchived(user.id, params.id, body.archived);
  return updateAccount(user.id, params.id, body);
});

export const DELETE = apiRoute<Params>(async ({ user, params }) => {
  await deleteAccount(user.id, params.id);
  return new Response(null, { status: 204 });
});
