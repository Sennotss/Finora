import "server-only";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { formatDateOnly, parseDateOnly } from "@/lib/dates";
import { D, roundMoney } from "@/lib/money";
import { PAYMENT_METHOD_LABELS, TRANSACTION_TYPE_LABELS } from "@/features/transactions/schemas";
import type { TransactionWithRelations } from "@/features/transactions/service";
import {
  DATE_FORMATS,
  IMPORT_FIELDS,
  TEMPLATE_EXAMPLE_ROWS,
  TEMPLATE_HEADERS,
  cellToString,
  duplicateKey,
  validateRows,
  type ColumnMapping,
  type ImportOptions,
} from "./parse";

export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

// ---------------------------------------------------------------------------
// Parsing uploaded files
// ---------------------------------------------------------------------------

export async function parseUpload(file: File): Promise<{ headers: string[]; rows: string[][]; fileName: string }> {
  if (file.size === 0) throw new AppError("The file is empty");
  if (file.size > MAX_IMPORT_BYTES) throw new AppError("Files must be 4 MB or smaller");
  const name = file.name.toLowerCase();
  let table: string[][];

  if (name.endsWith(".csv") || file.type === "text/csv") {
    const text = await file.text();
    const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
    if (parsed.errors.length > 0 && parsed.data.length === 0) throw new AppError(`Could not read the CSV: ${parsed.errors[0].message}`);
    table = parsed.data.map((r) => r.map((c) => String(c ?? "")));
  } else if (name.endsWith(".xlsx")) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(await file.arrayBuffer());
    } catch {
      throw new AppError("Could not read the Excel file. Save it as .xlsx and try again.");
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new AppError("The workbook has no sheets");
    table = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      table.push(values.map(cellToString));
    });
  } else {
    throw new AppError("Upload a .csv or .xlsx file");
  }

  const [headerRow, ...rows] = table.filter((r) => r.some((c) => c.trim() !== ""));
  if (!headerRow) throw new AppError("No rows found in the file");
  if (rows.length === 0) throw new AppError("The file only contains a header row");
  if (rows.length > MAX_IMPORT_ROWS) throw new AppError(`Import up to ${MAX_IMPORT_ROWS} rows at a time (found ${rows.length})`);
  const width = headerRow.length;
  return { headers: headerRow.map((h, i) => h.trim() || `Column ${i + 1}`), rows: rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? "")), fileName: file.name };
}

// ---------------------------------------------------------------------------
// Preview and commit
// ---------------------------------------------------------------------------

const fieldKeys = IMPORT_FIELDS.map((f) => f.key) as [string, ...string[]];

export const importPayloadSchema = z.object({
  fileName: z.string().max(200).default("import"),
  rows: z.array(z.array(z.string().max(2000)).max(100)).min(1).max(MAX_IMPORT_ROWS),
  mapping: z.partialRecord(z.enum(fieldKeys), z.number().int().min(0).max(99)),
  options: z.object({
    dateFormat: z.enum(DATE_FORMATS),
    decimalSeparator: z.enum([".", ","]),
    defaultAccountId: z.string().max(64).nullable(),
    unknownCategory: z.enum(["error", "uncategorized"]),
  }),
});

export const commitPayloadSchema = importPayloadSchema.extend({
  includeDuplicates: z.boolean().default(false),
});

async function validatePayload(userId: string, payload: z.infer<typeof importPayloadSchema>) {
  for (const field of IMPORT_FIELDS) {
    if (field.required && payload.mapping[field.key] === undefined) throw new AppError(`Map a column to "${field.label}"`, 422);
  }
  const [accounts, categories] = await Promise.all([
    db.account.findMany({ where: { userId }, select: { id: true, name: true, currency: true, status: true } }),
    db.category.findMany({ where: { userId, deletedAt: null }, select: { id: true, name: true, kind: true, parentId: true } }),
  ]);
  if (payload.options.defaultAccountId && !accounts.some((a) => a.id === payload.options.defaultAccountId)) throw new AppError("Default account not found", 422);

  // First pass without duplicate info to find the date span, then load existing keys for it.
  const firstPass = validateRows(payload.rows, payload.mapping as ColumnMapping, payload.options as ImportOptions, accounts, categories, new Set());
  const dates = firstPass.filter((r) => r.input).map((r) => r.input!.date).sort();
  const existingKeys = new Set<string>();
  if (dates.length > 0) {
    const existing = await db.transaction.findMany({
      where: { userId, deletedAt: null, date: { gte: parseDateOnly(dates[0]), lte: parseDateOnly(dates[dates.length - 1]) } },
      select: { date: true, type: true, amount: true, accountId: true, description: true },
    });
    for (const t of existing) existingKeys.add(duplicateKey({ date: formatDateOnly(t.date), type: t.type, amount: t.amount.toString(), accountId: t.accountId, description: t.description }));
  }
  const rows = validateRows(payload.rows, payload.mapping as ColumnMapping, payload.options as ImportOptions, accounts, categories, existingKeys);
  return { rows, accounts };
}

export async function previewImport(userId: string, raw: unknown) {
  const payload = importPayloadSchema.parse(raw);
  const { rows } = await validatePayload(userId, payload);
  return {
    rows,
    summary: {
      total: rows.length,
      valid: rows.filter((r) => r.status === "valid").length,
      duplicates: rows.filter((r) => r.status === "duplicate").length,
      invalid: rows.filter((r) => r.status === "invalid").length,
    },
  };
}

/**
 * Re-validates on the server and imports valid rows (plus duplicates only if explicitly
 * requested) in one database transaction. Invalid rows are never imported.
 */
export async function commitImport(userId: string, raw: unknown) {
  const payload = commitPayloadSchema.parse(raw);
  const { rows, accounts } = await validatePayload(userId, payload);
  const toImport = rows.filter((r) => r.status === "valid" || (payload.includeDuplicates && r.status === "duplicate"));
  const skippedInvalid = rows.filter((r) => r.status === "invalid");
  const skippedDuplicates = payload.includeDuplicates ? [] : rows.filter((r) => r.status === "duplicate");
  if (toImport.length === 0) throw new AppError("There are no valid rows to import", 422);

  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
  const batchId = await db.$transaction(
    async (tx) => {
      const batch = await tx.importBatch.create({
        data: { userId, fileName: payload.fileName, totalRows: rows.length, importedRows: toImport.length, skippedRows: rows.length - toImport.length },
      });
      const tagNames = [...new Set(toImport.flatMap((r) => r.input!.tags))];
      const tags = await Promise.all(tagNames.map((name) => tx.tag.upsert({ where: { userId_name: { userId, name } }, create: { userId, name }, update: {}, select: { id: true, name: true } })));
      const tagId = new Map(tags.map((t) => [t.name, t.id]));

      const records = toImport.map((r) => {
        const input = r.input!;
        const currency = currencyOf.get(input.accountId)!;
        const destCurrency = input.destinationAccountId ? currencyOf.get(input.destinationAccountId)! : currency;
        return {
          id: randomUUID(),
          userId,
          type: input.type,
          amount: roundMoney(input.amount, currency).toFixed(),
          currency,
          destinationAmount: input.destinationAmount ? roundMoney(input.destinationAmount, destCurrency).toFixed() : null,
          date: parseDateOnly(input.date),
          description: input.description,
          merchant: input.merchant,
          accountId: input.accountId,
          destinationAccountId: input.destinationAccountId,
          categoryId: input.categoryId,
          paymentMethod: input.paymentMethod as never,
          notes: input.notes,
          importBatchId: batch.id,
          tags: input.tags,
        };
      });
      for (let i = 0; i < records.length; i += 1000) {
        await tx.transaction.createMany({ data: records.slice(i, i + 1000).map(({ tags: _t, ...rest }) => (void _t, rest)) });
      }
      const links = records.flatMap((r) => r.tags.map((name) => ({ transactionId: r.id, tagId: tagId.get(name)! })));
      if (links.length) await tx.transactionTag.createMany({ data: links, skipDuplicates: true });
      return batch.id;
    },
    { timeout: 60_000 },
  );

  return {
    batchId,
    imported: toImport.length,
    skippedInvalid: skippedInvalid.map((r) => ({ rowNumber: r.rowNumber, errors: r.errors })),
    skippedDuplicates: skippedDuplicates.map((r) => r.rowNumber),
  };
}

export async function listImportBatches(userId: string) {
  return db.importBatch.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { _count: { select: { transactions: { where: { deletedAt: null } } } } },
  });
}

/** Soft-deletes every transaction created by an import. */
export async function undoImport(userId: string, batchId: string) {
  const batch = await db.importBatch.findFirst({ where: { id: batchId, userId } });
  if (!batch) throw new NotFoundError("Import");
  const r = await db.transaction.updateMany({ where: { userId, importBatchId: batchId, deletedAt: null }, data: { deletedAt: new Date() } });
  return r.count;
}

// ---------------------------------------------------------------------------
// Export and template
// ---------------------------------------------------------------------------

const EXPORT_HEADERS = ["Date", "Type", "Description", "Merchant", "Amount", "Currency", "Account", "Destination Account", "Destination Amount", "Category", "Subcategory", "Payment Method", "Tags", "Notes", "ID"];

function exportRow(t: TransactionWithRelations): (string | number)[] {
  const parent = t.category?.parent?.name;
  return [
    formatDateOnly(t.date),
    TRANSACTION_TYPE_LABELS[t.type],
    t.description,
    t.merchant ?? "",
    D(t.amount).toFixed(),
    t.currency,
    t.account.name,
    t.destinationAccount?.name ?? "",
    t.destinationAmount ? D(t.destinationAmount).toFixed() : "",
    parent ?? t.category?.name ?? "",
    parent ? t.category!.name : "",
    t.paymentMethod ? PAYMENT_METHOD_LABELS[t.paymentMethod] : "",
    t.tags.map((x) => x.tag.name).join("; "),
    t.notes ?? "",
    t.id,
  ];
}

/** Neutralise spreadsheet formula injection in exported text cells. */
function safeCell(v: string | number) {
  return typeof v === "string" && /^[=+\-@\t\r]/.test(v) && !/^-?\d/.test(v) ? `'${v}` : v;
}

export function transactionsToCsv(items: TransactionWithRelations[]): string {
  return "﻿" + Papa.unparse({ fields: EXPORT_HEADERS, data: items.map((t) => exportRow(t).map(safeCell)) });
}

export async function transactionsToXlsx(items: TransactionWithRelations[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Finora";
  const sheet = workbook.addWorksheet("Transactions", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addRow(EXPORT_HEADERS).font = { bold: true };
  for (const t of items) {
    const row = exportRow(t).map(safeCell);
    // Amounts are written as numbers so spreadsheet formulas can sum them.
    row[4] = Number(row[4]);
    if (row[8] !== "") row[8] = Number(row[8]);
    sheet.addRow(row);
  }
  sheet.columns.forEach((c, i) => (c.width = [12, 10, 36, 20, 16, 9, 18, 18, 16, 18, 18, 16, 20, 30, 28][i] ?? 14));
  sheet.getColumn(5).numFmt = "#,##0.####";
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function templateCsv(): string {
  return "﻿" + Papa.unparse({ fields: TEMPLATE_HEADERS, data: TEMPLATE_EXAMPLE_ROWS });
}

export async function templateXlsx(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Transactions");
  sheet.addRow(TEMPLATE_HEADERS).font = { bold: true };
  TEMPLATE_EXAMPLE_ROWS.forEach((r) => sheet.addRow(r));
  sheet.columns.forEach((c) => (c.width = 20));
  const help = workbook.addWorksheet("Instructions");
  [
    ["Column", "Required", "Notes"],
    ["date", "Yes", "YYYY-MM-DD recommended; DD/MM/YYYY and MM/DD/YYYY are supported via the import options"],
    ["type", "No", "income, expense or transfer. If empty, negative amounts are expenses and positive amounts income"],
    ["description", "Yes", "Up to 200 characters"],
    ["amount", "Yes", "Positive number; use the decimal separator chosen in the import options"],
    ["account", "No*", "Must match an account name exactly (case-insensitive). *Required unless a default account is chosen"],
    ["destination_account", "Transfers", "Destination account name for transfers"],
    ["destination_amount", "Cross-currency", "Amount received when the two accounts use different currencies"],
    ["category", "No", "Category name, or Parent > Subcategory"],
    ["payment_method", "No", "CASH, DEBIT_CARD, CREDIT_CARD, BANK_TRANSFER, E_WALLET, QRIS, OTHER"],
    ["merchant", "No", ""],
    ["tags", "No", "Separate multiple tags with semicolons"],
    ["notes", "No", ""],
  ].forEach((r, i) => {
    const row = help.addRow(r);
    if (i === 0) row.font = { bold: true };
  });
  help.columns.forEach((c, i) => (c.width = [22, 14, 90][i]));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
