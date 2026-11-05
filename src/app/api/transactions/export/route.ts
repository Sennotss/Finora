import { apiRoute, searchParamsObject } from "@/lib/api";
import { listTransactionsForExport, parseFilters } from "@/features/transactions/service";
import { transactionsToCsv, transactionsToXlsx } from "@/features/import/service";

/** GET /api/transactions/export?format=csv|xlsx&…filters */
export const GET = apiRoute(async ({ request, user }) => {
  const params = searchParamsObject(request);
  const format = params.format === "xlsx" ? "xlsx" : "csv";
  const items = await listTransactionsForExport(user.id, parseFilters(params));
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "xlsx") {
    const buffer = await transactionsToXlsx(items);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="finora-transactions-${stamp}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  return new Response(transactionsToCsv(items), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finora-transactions-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
});
