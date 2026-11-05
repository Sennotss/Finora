/**
 * Pure helpers for transaction import: column mapping, value parsing and row validation.
 * Shared by the preview and commit steps so both apply exactly the same rules.
 */
import { formatDateOnly, isValidDateString } from "@/lib/dates";
import { D } from "@/lib/money";
import { normalizeDescription } from "@/features/insights/categorize";

export const IMPORT_FIELDS = [
  { key: "date", label: "Date", required: true },
  { key: "description", label: "Description", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "type", label: "Type", required: false },
  { key: "account", label: "Account", required: false },
  { key: "destinationAccount", label: "Destination account", required: false },
  { key: "destinationAmount", label: "Destination amount", required: false },
  { key: "category", label: "Category", required: false },
  { key: "paymentMethod", label: "Payment method", required: false },
  { key: "merchant", label: "Merchant", required: false },
  { key: "tags", label: "Tags", required: false },
  { key: "notes", label: "Notes", required: false },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];
/** Field → column index in the source file. */
export type ColumnMapping = Partial<Record<ImportFieldKey, number>>;

export const DATE_FORMATS = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export type ImportOptions = {
  dateFormat: DateFormat;
  decimalSeparator: "." | ",";
  defaultAccountId: string | null;
  unknownCategory: "error" | "uncategorized";
};

export const TEMPLATE_HEADERS = ["date", "type", "description", "amount", "account", "destination_account", "destination_amount", "category", "payment_method", "merchant", "tags", "notes"];

export const TEMPLATE_EXAMPLE_ROWS = [
  ["2026-10-01", "income", "October salary", "15000000", "BCA", "", "", "Salary", "BANK_TRANSFER", "PT Example", "work", ""],
  ["2026-10-02", "expense", "Groceries", "350000", "BCA", "", "", "Groceries", "DEBIT_CARD", "Superindo", "home;weekly", ""],
  ["2026-10-05", "transfer", "Credit card repayment", "2000000", "BCA", "Credit Card", "", "", "BANK_TRANSFER", "", "", "Paid in full"],
];

const ALIASES: Record<ImportFieldKey, string[]> = {
  date: ["date", "tanggal", "transaction date", "tgl", "posting date", "value date"],
  description: ["description", "deskripsi", "keterangan", "details", "memo", "narrative", "name", "title"],
  amount: ["amount", "jumlah", "nominal", "value", "total", "nilai"],
  type: ["type", "tipe", "jenis", "transaction type", "kind"],
  account: ["account", "akun", "rekening", "source account", "from account", "wallet"],
  destinationAccount: ["destination account", "destination_account", "to account", "akun tujuan", "rekening tujuan"],
  destinationAmount: ["destination amount", "destination_amount", "received amount", "amount received"],
  category: ["category", "kategori", "subcategory"],
  paymentMethod: ["payment method", "payment_method", "metode", "metode pembayaran", "method"],
  merchant: ["merchant", "payee", "vendor", "toko", "counterparty"],
  tags: ["tags", "tag", "label", "labels"],
  notes: ["notes", "note", "catatan", "comment", "comments"],
};

/** Guesses a mapping from header names; unmatched fields stay unmapped. */
export function guessMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map((h) => h.trim().toLowerCase().replace(/[_-]+/g, " "));
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  for (const field of IMPORT_FIELDS) {
    const aliases = ALIASES[field.key].map((a) => a.replace(/[_-]+/g, " "));
    const index = normalized.findIndex((h, i) => !used.has(i) && aliases.includes(h));
    if (index >= 0) {
      mapping[field.key] = index;
      used.add(index);
    }
  }
  return mapping;
}

export function parseDateValue(raw: string, format: DateFormat): string | null {
  const value = raw.trim();
  if (!value) return null;
  // ISO dates (including ISO timestamps from spreadsheets) are always accepted.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  if (iso) return toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const parts = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(value);
  if (!parts) return null;
  let [a, b, y] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (y < 100) y += 2000;
  if (format === "MM/DD/YYYY") [a, b] = [b, a];
  return toIso(y, b, a);
}

function toIso(year: number, month: number, day: number): string | null {
  const s = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isValidDateString(s) ? s : null;
}

/** Parses "Rp 1.500.000", "-25,000.50", "(1,200)" etc. Returns a signed canonical string. */
export function parseAmountValue(raw: string, decimalSeparator: "." | ","): string | null {
  let value = raw.trim();
  if (!value) return null;
  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }
  if (value.includes("-")) negative = true;
  value = value.replace(/[^\d.,]/g, "");
  const group = decimalSeparator === "." ? "," : ".";
  value = value.split(group).join("");
  if (decimalSeparator === ",") value = value.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const d = D(value);
  if (d.decimalPlaces() > 4) return null;
  return (negative ? d.negated() : d).toFixed();
}

const TYPE_WORDS: Record<string, "INCOME" | "EXPENSE" | "TRANSFER"> = {
  income: "INCOME",
  pemasukan: "INCOME",
  in: "INCOME",
  credit: "INCOME",
  cr: "INCOME",
  expense: "EXPENSE",
  pengeluaran: "EXPENSE",
  out: "EXPENSE",
  debit: "EXPENSE",
  db: "EXPENSE",
  transfer: "TRANSFER",
  pindah: "TRANSFER",
};

export function parseTypeValue(raw: string): "INCOME" | "EXPENSE" | "TRANSFER" | null {
  return TYPE_WORDS[raw.trim().toLowerCase()] ?? null;
}

const METHOD_WORDS: Record<string, string> = {
  cash: "CASH",
  tunai: "CASH",
  debit: "DEBIT_CARD",
  "debit card": "DEBIT_CARD",
  debit_card: "DEBIT_CARD",
  credit: "CREDIT_CARD",
  "credit card": "CREDIT_CARD",
  credit_card: "CREDIT_CARD",
  "bank transfer": "BANK_TRANSFER",
  bank_transfer: "BANK_TRANSFER",
  transfer: "BANK_TRANSFER",
  "e-wallet": "E_WALLET",
  ewallet: "E_WALLET",
  e_wallet: "E_WALLET",
  qris: "QRIS",
  other: "OTHER",
};

export function parsePaymentMethod(raw: string): string | null {
  if (!raw.trim()) return null;
  return METHOD_WORDS[raw.trim().toLowerCase()] ?? null;
}

export type RefAccount = { id: string; name: string; currency: string; status: "ACTIVE" | "ARCHIVED" };
export type RefCategory = { id: string; name: string; kind: "INCOME" | "EXPENSE"; parentId: string | null };

export type ValidatedRow = {
  rowNumber: number;
  status: "valid" | "invalid" | "duplicate";
  errors: string[];
  warnings: string[];
  /** Canonical input for the transaction service (present when valid or duplicate). */
  input: {
    type: "INCOME" | "EXPENSE" | "TRANSFER";
    amount: string;
    destinationAmount: string | null;
    date: string;
    description: string;
    merchant: string | null;
    accountId: string;
    destinationAccountId: string | null;
    categoryId: string | null;
    paymentMethod: string | null;
    tags: string[];
    notes: string | null;
  } | null;
  display: { date: string; type: string; description: string; amount: string; account: string; category: string };
};

export function duplicateKey(row: { date: string; type: string; amount: string; accountId: string; description: string }) {
  return [row.date, row.type, D(row.amount).toFixed(), row.accountId, normalizeDescription(row.description)].join("|");
}

function findCategory(name: string, kind: "INCOME" | "EXPENSE", categories: RefCategory[]): RefCategory | null {
  const pool = categories.filter((c) => c.kind === kind);
  const parts = name.split(/\s*(?:>|\/)\s*/).filter(Boolean);
  if (parts.length === 2) {
    const parent = pool.find((c) => !c.parentId && c.name.toLowerCase() === parts[0].toLowerCase());
    return pool.find((c) => c.parentId === parent?.id && c.name.toLowerCase() === parts[1].toLowerCase()) ?? null;
  }
  const lower = name.toLowerCase();
  return pool.find((c) => c.name.toLowerCase() === lower && !c.parentId) ?? pool.find((c) => c.name.toLowerCase() === lower) ?? null;
}

/**
 * Validates and normalises source rows. `existingKeys` holds duplicate keys of transactions
 * already stored; rows that repeat an earlier row in the same file are also duplicates.
 */
export function validateRows(
  rows: string[][],
  mapping: ColumnMapping,
  options: ImportOptions,
  accounts: RefAccount[],
  categories: RefCategory[],
  existingKeys: Set<string>,
  firstRowNumber = 2,
): ValidatedRow[] {
  const seen = new Set<string>();
  const cell = (row: string[], key: ImportFieldKey) => (mapping[key] === undefined ? "" : String(row[mapping[key]!] ?? "").trim());
  const accountByName = (name: string) => accounts.find((a) => a.name.toLowerCase() === name.toLowerCase()) ?? null;

  return rows.map((row, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const rowNumber = firstRowNumber + i;

    const date = parseDateValue(cell(row, "date"), options.dateFormat);
    if (!date) errors.push(`Invalid date "${cell(row, "date")}" (expected ${options.dateFormat})`);

    const description = cell(row, "description").slice(0, 200);
    if (!description) errors.push("Description is required");

    const signed = parseAmountValue(cell(row, "amount"), options.decimalSeparator);
    if (signed === null) errors.push(`Invalid amount "${cell(row, "amount")}"`);
    else if (D(signed).isZero()) errors.push("Amount must not be zero");

    const rawType = cell(row, "type");
    let type = rawType ? parseTypeValue(rawType) : null;
    if (rawType && !type) errors.push(`Unknown type "${rawType}" (use income, expense or transfer)`);
    if (!rawType && signed !== null) type = D(signed).isNegative() ? "EXPENSE" : "INCOME";

    const accountName = cell(row, "account");
    const account = accountName ? accountByName(accountName) : accounts.find((a) => a.id === options.defaultAccountId) ?? null;
    if (!account) errors.push(accountName ? `Unknown account "${accountName}"` : "No account given and no default account selected");
    else if (account.status === "ARCHIVED") errors.push(`Account "${account.name}" is archived`);

    let destinationAccountId: string | null = null;
    let destinationAmount: string | null = null;
    if (type === "TRANSFER") {
      const destName = cell(row, "destinationAccount");
      const dest = destName ? accountByName(destName) : null;
      if (!dest) errors.push(destName ? `Unknown destination account "${destName}"` : "Transfers need a destination account");
      else if (dest.id === account?.id) errors.push("Destination must differ from the source account");
      else if (dest.status === "ARCHIVED") errors.push(`Account "${dest.name}" is archived`);
      else {
        destinationAccountId = dest.id;
        if (account && dest.currency !== account.currency) {
          const parsedDest = parseAmountValue(cell(row, "destinationAmount"), options.decimalSeparator);
          if (!parsedDest || D(parsedDest).lessThanOrEqualTo(0)) errors.push(`Cross-currency transfer needs a destination amount in ${dest.currency}`);
          else destinationAmount = D(parsedDest).abs().toFixed();
        }
      }
    }

    let categoryId: string | null = null;
    const categoryName = cell(row, "category");
    if (categoryName && type && type !== "TRANSFER") {
      const category = findCategory(categoryName, type, categories);
      if (category) categoryId = category.id;
      else if (options.unknownCategory === "error") errors.push(`Unknown ${type.toLowerCase()} category "${categoryName}"`);
      else warnings.push(`Unknown category "${categoryName}" — imported as uncategorised`);
    }

    const rawMethod = cell(row, "paymentMethod");
    const paymentMethod = parsePaymentMethod(rawMethod);
    if (rawMethod && !paymentMethod) warnings.push(`Unknown payment method "${rawMethod}" ignored`);

    const tags = cell(row, "tags")
      .split(/[;,]/)
      .map((t) => t.trim().slice(0, 30))
      .filter(Boolean)
      .slice(0, 10);

    const display = {
      date: date ?? cell(row, "date"),
      type: type ?? rawType,
      description,
      amount: signed ? D(signed).abs().toFixed() : cell(row, "amount"),
      account: account?.name ?? accountName,
      category: categoryName,
    };

    if (errors.length > 0 || !date || !type || !account || signed === null) {
      return { rowNumber, status: "invalid", errors, warnings, input: null, display };
    }

    const input = {
      type,
      amount: D(signed).abs().toFixed(),
      destinationAmount,
      date,
      description,
      merchant: cell(row, "merchant").slice(0, 120) || null,
      accountId: account.id,
      destinationAccountId,
      categoryId,
      paymentMethod,
      tags,
      notes: cell(row, "notes").slice(0, 1000) || null,
    };
    const key = duplicateKey(input);
    const duplicate = existingKeys.has(key) || seen.has(key);
    seen.add(key);
    if (duplicate) warnings.push(existingKeys.has(key) ? "Matches an existing transaction" : "Repeats an earlier row in this file");
    return { rowNumber, status: duplicate ? "duplicate" : "valid", errors, warnings, input, display };
  });
}

/** Cell values from spreadsheets (Date, number, rich text) as plain strings. */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatDateOnly(new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())));
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "object") {
    const v = value as { text?: unknown; result?: unknown; richText?: Array<{ text: string }> };
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if (v.result !== undefined) return cellToString(v.result);
    if (v.text !== undefined) return String(v.text);
  }
  return String(value);
}
