import type { Metadata } from "next";
import { Suspense } from "react";
import { LineChart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { PlanningSimulator } from "@/components/planning/planning-simulator";
import { requireUserContext } from "@/lib/dal";
import { eachMonthStart, formatDateOnly, lastNMonths } from "@/lib/dates";
import { balancesFromDeltas, summarizePosition } from "@/features/analytics/calculations";
import { loadPosition } from "@/features/finance/repository";
import { isLiquidAccount } from "@/features/finance/types";
import { buildBaseline } from "@/features/planning/service";
import { describeAssumptions } from "@/features/planning/projection";

export const metadata: Metadata = { title: "Financial Planning" };

export default function PlanningPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Financial planning" description="Forecast the next 3, 6 or 12 months and test what-if scenarios. Simulations never change your real records." />
      <Suspense fallback={<LoadingSkeleton />}>
        <Planning />
      </Suspense>
    </div>
  );
}

async function Planning() {
  const { user, ctx } = await requireUserContext();
  const [baseline, { accounts, deltas }] = await Promise.all([buildBaseline(user.id), loadPosition(user.id)]);
  if (accounts.length === 0) {
    return <Card><CardContent><EmptyState icon={LineChart} title="Add an account to start planning" description="Forecasts are built from your balances, history and recurring bills." /></CardContent></Card>;
  }
  // Actual month-end history (liquid cash and net worth) for the six months before today.
  const months = eachMonthStart(lastNMonths(ctx.today, 7)).slice(0, -1);
  const history = months.map((m) => {
    const balances = balancesFromDeltas(accounts, deltas, m);
    const position = summarizePosition(accounts, balances, ctx.converter);
    const liquid = summarizePosition(accounts.filter((a) => isLiquidAccount(a.type)), balances, ctx.converter).liquid;
    return { month: formatDateOnly(m), cash: liquid.toFixed(2), netWorth: position.netWorth.toFixed(2) };
  });
  return <PlanningSimulator baseline={baseline} history={history} assumptions={describeAssumptions(baseline)} />;
}
