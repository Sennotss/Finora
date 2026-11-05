import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { ImportWizard } from "@/components/transactions/import-wizard";
import { requireUser } from "@/lib/dal";
import { listActiveAccounts } from "@/features/accounts/service";
import { listImportBatches } from "@/features/import/service";

export const metadata: Metadata = { title: "Import transactions" };

export default function ImportPage() {
  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/transactions"><ChevronLeft /> Transactions</Link>
      </Button>
      <PageHeader title="Import transactions" description="Upload a CSV or Excel file, map its columns, review every row, then import. Invalid rows are never imported." />
      <Suspense fallback={<LoadingSkeleton variant="table" />}>
        <ImportContent />
      </Suspense>
    </div>
  );
}

async function ImportContent() {
  const user = await requireUser();
  const [accounts, batches] = await Promise.all([listActiveAccounts(user.id), listImportBatches(user.id)]);
  return (
    <ImportWizard
      accounts={accounts}
      batches={batches.map((b) => ({ id: b.id, fileName: b.fileName, createdAt: b.createdAt.toISOString(), importedRows: b.importedRows, remaining: b._count.transactions }))}
    />
  );
}
