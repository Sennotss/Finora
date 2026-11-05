import { apiRoute, searchParamsObject } from "@/lib/api";
import { getUserContext } from "@/lib/dal";
import { formatDateOnly } from "@/lib/dates";
import { periodFromSearchParams } from "@/lib/period";
import { buildFinancialContext, serializeSeries } from "@/features/analytics/service";

/** GET /api/dashboard?period=this_month|…|custom&from=&to= — summary figures for a period. */
export const GET = apiRoute(async ({ request, user }) => {
  const ctx = await getUserContext(user.id);
  const period = periodFromSearchParams(searchParamsObject(request), ctx.today, ctx.weekStartsOn);
  const data = await buildFinancialContext(user.id, period);
  const s = (d: { toFixed(): string }) => d.toFixed();
  return {
    currency: ctx.baseCurrency,
    period: { preset: period.preset, start: formatDateOnly(period.range.start), end: formatDateOnly(period.range.end) },
    position: { liquid: s(data.position.liquid), assets: s(data.position.assets), liabilities: s(data.position.liabilities), netWorth: s(data.position.netWorth) },
    cashFlow: {
      income: s(data.current.income),
      expense: s(data.current.expense),
      net: s(data.current.net),
      savingRate: data.current.savingRate?.toDecimalPlaces(2).toFixed() ?? null,
      previous: { income: s(data.previous.income), expense: s(data.previous.expense), net: s(data.previous.net) },
    },
    series: serializeSeries(data.cashFlow, data.granularity),
    expenseBreakdown: data.expenseBreakdown.map((r) => ({ categoryId: r.categoryId, name: r.name, amount: s(r.amount), share: r.share.toDecimalPlaces(2).toFixed() })),
    healthScore: { score: data.health.score, grade: data.health.grade },
    insights: data.insights,
    missingCurrencies: data.position.missingCurrencies,
  };
});
