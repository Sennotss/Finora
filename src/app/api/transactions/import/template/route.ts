import { apiRoute, searchParamsObject } from "@/lib/api";
import { templateCsv, templateXlsx } from "@/features/import/service";

export const GET = apiRoute(async ({ request }) => {
  if (searchParamsObject(request).format === "xlsx") {
    return new Response(new Uint8Array(await templateXlsx()), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="finora-import-template.xlsx"',
      },
    });
  }
  return new Response(templateCsv(), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="finora-import-template.csv"' },
  });
});
