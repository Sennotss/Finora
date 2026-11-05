import { apiRoute } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { guessMapping } from "@/features/import/parse";
import { parseUpload } from "@/features/import/service";

/** POST multipart "file" → headers, rows and a suggested column mapping. Nothing is stored. */
export const POST = apiRoute(async ({ request }) => {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("Attach a .csv or .xlsx file");
  const parsed = await parseUpload(file);
  return { ...parsed, mapping: guessMapping(parsed.headers) };
});
