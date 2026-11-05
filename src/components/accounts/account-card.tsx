import Link from "next/link";
import type Decimal from "decimal.js";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { IconBadge } from "@/components/shared/icon";
import { Money } from "@/components/shared/money";
import { ACCOUNT_TYPE_LABELS, isLiabilityAccount, type LedgerAccount } from "@/features/finance/types";
import { D } from "@/lib/money";

export function AccountCard({ account, balance, balanceBase, baseCurrency, locale }: { account: LedgerAccount; balance: Decimal; balanceBase: Decimal | null; baseCurrency: string; locale: string }) {
  const liability = isLiabilityAccount(account.type);
  const owed = liability && balance.isNegative() ? balance.negated() : null;
  const utilisation = owed && account.creditLimit && D(account.creditLimit).greaterThan(0) ? owed.div(account.creditLimit).times(100) : null;
  return (
    <Link href={`/accounts/${account.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
      <Card className="h-full transition-colors hover:bg-muted/30">
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <IconBadge name={account.icon} color={account.color} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{account.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {ACCOUNT_TYPE_LABELS[account.type]}
                {account.institution && ` · ${account.institution}`}
              </p>
            </div>
            {account.status === "ARCHIVED" && <Badge variant="secondary">Archived</Badge>}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{owed ? "Amount owed" : "Balance"}</p>
            <p className="text-xl font-semibold tracking-tight">
              <Money value={owed ?? balance} currency={account.currency} locale={locale} />
            </p>
            {account.currency !== baseCurrency && (
              <p className="text-xs text-muted-foreground">
                {balanceBase ? <>≈ <Money value={balanceBase} currency={baseCurrency} locale={locale} /></> : `No ${account.currency}→${baseCurrency} rate`}
              </p>
            )}
          </div>
          {utilisation && (
            <div className="space-y-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-primary/10" aria-hidden>
                <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.min(100, utilisation.toNumber())}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">{utilisation.toDecimalPlaces(0).toString()}% of limit used</p>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
