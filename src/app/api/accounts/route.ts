import { apiRoute, readJson } from "@/lib/api";
import { getUserContext } from "@/lib/dal";
import { createAccount } from "@/features/accounts/service";
import { loadPosition } from "@/features/finance/repository";

/** GET /api/accounts — every account with its current balance (account currency and base currency). */
export const GET = apiRoute(async ({ user }) => {
  const [{ position }, ctx] = await Promise.all([loadPosition(user.id), getUserContext(user.id)]);
  return {
    baseCurrency: ctx.baseCurrency,
    accounts: position.accounts.map(({ account, balance, balanceBase }) => ({ ...account, balance: balance.toFixed(), balanceBase: balanceBase?.toFixed() ?? null })),
    totals: { liquid: position.liquid.toFixed(), assets: position.assets.toFixed(), liabilities: position.liabilities.toFixed(), netWorth: position.netWorth.toFixed() },
  };
});

export const POST = apiRoute(async ({ request, user }) => Response.json(await createAccount(user.id, await readJson(request)), { status: 201 }));
