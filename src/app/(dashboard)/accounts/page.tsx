import type { Metadata } from "next";
import { Suspense } from "react";
import { Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AccountCard } from "@/components/accounts/account-card";
import { NewAccountButton } from "@/components/accounts/account-dialogs";
import { FinancialSummaryCard } from "@/components/dashboard/financial-summary-card";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { requireUserContext } from "@/lib/dal";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { loadPosition } from "@/features/finance/repository";
import { isLiabilityAccount } from "@/features/finance/types";

export const metadata: Metadata = { title: "Accounts" };

export default function AccountsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton variant="cards" />}>
      <Accounts />
    </Suspense>
  );
}

async function Accounts() {
  const { user, ctx } = await requireUserContext();
  const { position } = await loadPosition(user.id);
  const today = formatDateOnly(ctx.today);
  const active = position.accounts.filter((a) => a.account.status === "ACTIVE");
  const groups = [
    { title: "Assets", rows: active.filter((a) => !isLiabilityAccount(a.account.type)) },
    { title: "Liabilities", rows: active.filter((a) => isLiabilityAccount(a.account.type)) },
    { title: "Archived", rows: position.accounts.filter((a) => a.account.status === "ARCHIVED") },
  ].filter((g) => g.rows.length > 0);
  const money = (v: Parameters<typeof formatMoney>[0]) => formatMoney(v, ctx.baseCurrency, { locale: ctx.locale });

  return (
    <div className="space-y-6">
      <PageHeader title="Accounts" description="Balances are calculated from each account's opening balance plus every transaction." actions={<NewAccountButton today={today} />} />
      {position.accounts.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={Wallet} title="No accounts yet" description="Create your first account to start recording transactions." />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FinancialSummaryCard label="Net worth" value={money(position.netWorth)} emphasis />
            <FinancialSummaryCard label="Total balance (liquid)" value={money(position.liquid)} />
            <FinancialSummaryCard label="Total assets" value={money(position.assets)} />
            <FinancialSummaryCard label="Total liabilities" value={money(position.liabilities)} />
          </div>
          {position.missingCurrencies.length > 0 && (
            <p className="text-sm text-muted-foreground">Balances in {position.missingCurrencies.join(", ")} are excluded from totals until you add an exchange rate in Settings.</p>
          )}
          {groups.map((g) => (
            <section key={g.title} className="space-y-3" aria-label={g.title}>
              <h2 className="text-sm font-medium text-muted-foreground">{g.title}</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {g.rows.map((r) => (
                  <AccountCard key={r.account.id} account={r.account} balance={r.balance} balanceBase={r.balanceBase} baseCurrency={ctx.baseCurrency} locale={ctx.locale} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
