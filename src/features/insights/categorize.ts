/**
 * Smart categorisation: suggests a category for a transaction description using, in order,
 * (1) the user's own history for the same merchant/description, (2) similar past
 * descriptions, and (3) a built-in keyword dictionary. Suggestions are always optional.
 */

const NOISE_WORDS = new Set([
  "payment",
  "pembayaran",
  "bayar",
  "purchase",
  "pos",
  "trx",
  "trf",
  "transfer",
  "ref",
  "debit",
  "credit",
  "kartu",
  "card",
  "via",
  "the",
  "and",
  "dan",
  "di",
  "ke",
  "id",
  "inv",
  "invoice",
  "ltd",
  "pt",
  "tbk",
]);

export function normalizeDescription(description: string): string {
  return description
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !NOISE_WORDS.has(w))
    .join(" ")
    .trim();
}

export function tokens(description: string): Set<string> {
  return new Set(normalizeDescription(description).split(" ").filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Keyword → category-name hints. Names are matched case-insensitively against the user's categories. */
export const KEYWORD_RULES: Array<{ pattern: RegExp; categories: string[]; kind: "INCOME" | "EXPENSE" }> = [
  { pattern: /\b(gaji|salary|payroll|upah)\b/, categories: ["Salary"], kind: "INCOME" },
  { pattern: /\b(bonus|thr)\b/, categories: ["Bonus", "Salary"], kind: "INCOME" },
  { pattern: /\b(freelance|project|honor|fee)\b/, categories: ["Freelance", "Business"], kind: "INCOME" },
  { pattern: /\b(dividen|dividend|bunga|interest|coupon)\b/, categories: ["Investment Income", "Interest"], kind: "INCOME" },
  { pattern: /\b(refund|cashback)\b/, categories: ["Refunds", "Other Income"], kind: "INCOME" },
  { pattern: /\b(grab|gojek|gocar|goride|maxim|uber|taxi|taksi|bluebird|ojek)\b/, categories: ["Ride Hailing", "Transportation"], kind: "EXPENSE" },
  { pattern: /\b(pertamina|shell|bensin|bbm|fuel|spbu|vivo|bp)\b/, categories: ["Fuel", "Transportation"], kind: "EXPENSE" },
  { pattern: /\b(krl|mrt|lrt|transjakarta|kai|tiket kereta|parkir|parking|tol|toll|commuter)\b/, categories: ["Public Transport", "Transportation"], kind: "EXPENSE" },
  { pattern: /\b(indomaret|alfamart|alfamidi|superindo|hypermart|transmart|lottemart|supermarket|grocery|groceries|sayur|pasar)\b/, categories: ["Groceries", "Food & Dining"], kind: "EXPENSE" },
  { pattern: /\b(gofood|grabfood|shopeefood|restaurant|restoran|resto|cafe|kopi|coffee|starbucks|mcd|mcdonald|kfc|warung|bakso|makan|lunch|dinner|breakfast)\b/, categories: ["Restaurants", "Food & Dining"], kind: "EXPENSE" },
  { pattern: /\b(netflix|spotify|youtube|disney|vidio|prime video|apple|icloud|google one|chatgpt|subscription|langganan)\b/, categories: ["Subscriptions", "Entertainment"], kind: "EXPENSE" },
  { pattern: /\b(pln|listrik|electricity|token listrik)\b/, categories: ["Electricity", "Utilities", "Bills & Utilities"], kind: "EXPENSE" },
  { pattern: /\b(pdam|water)\b/, categories: ["Water", "Utilities", "Bills & Utilities"], kind: "EXPENSE" },
  { pattern: /\b(indihome|biznet|firstmedia|myrepublic|internet|wifi)\b/, categories: ["Internet", "Utilities", "Bills & Utilities"], kind: "EXPENSE" },
  { pattern: /\b(telkomsel|indosat|xl|axis|smartfren|pulsa|paket data)\b/, categories: ["Phone", "Utilities", "Bills & Utilities"], kind: "EXPENSE" },
  { pattern: /\b(kos|kost|sewa|rent|apartemen|apartment)\b/, categories: ["Rent", "Housing"], kind: "EXPENSE" },
  { pattern: /\b(bpjs|asuransi|insurance|prudential|allianz|axa)\b/, categories: ["Insurance"], kind: "EXPENSE" },
  { pattern: /\b(apotek|pharmacy|kimia farma|guardian|watsons|dokter|doctor|klinik|clinic|hospital|rumah sakit)\b/, categories: ["Health", "Healthcare"], kind: "EXPENSE" },
  { pattern: /\b(tokopedia|shopee|lazada|blibli|bukalapak|zalora|uniqlo|zara)\b/, categories: ["Shopping"], kind: "EXPENSE" },
  { pattern: /\b(cinema|bioskop|xxi|cgv|game|steam|playstation|concert|konser)\b/, categories: ["Entertainment"], kind: "EXPENSE" },
  { pattern: /\b(course|kursus|udemy|coursera|buku|book|gramedia|sekolah|school|kuliah|tuition|spp)\b/, categories: ["Education"], kind: "EXPENSE" },
  { pattern: /\b(traveloka|tiket com|agoda|booking|airbnb|hotel|garuda|lion air|citilink|airasia|flight|pesawat)\b/, categories: ["Travel"], kind: "EXPENSE" },
  { pattern: /\b(cicilan|installment|kpr|loan|pinjaman|kredit)\b/, categories: ["Loan Payment", "Debt Payments"], kind: "EXPENSE" },
  { pattern: /\b(zakat|sedekah|infaq|donasi|donation|charity|kitabisa)\b/, categories: ["Donations", "Gifts & Donations"], kind: "EXPENSE" },
];

export type CategoryOption = { id: string; name: string; kind: "INCOME" | "EXPENSE" };
export type HistoryItem = { description: string; categoryId: string };

export type CategorySuggestion = {
  categoryId: string;
  categoryName: string;
  confidence: "high" | "medium" | "low";
  reason: string;
};

export function suggestCategory(
  description: string,
  kind: "INCOME" | "EXPENSE",
  history: HistoryItem[],
  categories: CategoryOption[],
): CategorySuggestion | null {
  const normalized = normalizeDescription(description);
  if (normalized.length < 2) return null;
  const eligible = new Map(categories.filter((c) => c.kind === kind).map((c) => [c.id, c]));
  const relevant = history.filter((h) => eligible.has(h.categoryId));

  // 1. Exact normalised match in the user's own history.
  const exact = new Map<string, number>();
  for (const h of relevant) if (normalizeDescription(h.description) === normalized) exact.set(h.categoryId, (exact.get(h.categoryId) ?? 0) + 1);
  if (exact.size > 0) {
    const [categoryId, count] = [...exact.entries()].sort((a, b) => b[1] - a[1])[0];
    const total = [...exact.values()].reduce((a, b) => a + b, 0);
    return {
      categoryId,
      categoryName: eligible.get(categoryId)!.name,
      confidence: count / total >= 0.7 ? "high" : "medium",
      reason: `You used this category for ${count} of ${total} similar transaction${total === 1 ? "" : "s"}.`,
    };
  }

  // 2. Similar descriptions (token overlap), weighted by similarity.
  const own = tokens(description);
  const votes = new Map<string, number>();
  let matches = 0;
  for (const h of relevant) {
    const sim = jaccard(own, tokens(h.description));
    if (sim >= 0.5) {
      votes.set(h.categoryId, (votes.get(h.categoryId) ?? 0) + sim);
      matches++;
    }
  }
  if (votes.size > 0) {
    const [categoryId] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      categoryId,
      categoryName: eligible.get(categoryId)!.name,
      confidence: "medium",
      reason: `Based on ${matches} past transaction${matches === 1 ? "" : "s"} with a similar description.`,
    };
  }

  // 3. Built-in keyword dictionary.
  const byName = new Map([...eligible.values()].map((c) => [c.name.toLowerCase(), c]));
  for (const rule of KEYWORD_RULES) {
    if (rule.kind !== kind || !rule.pattern.test(normalized)) continue;
    for (const name of rule.categories) {
      const match = byName.get(name.toLowerCase());
      if (match) {
        return { categoryId: match.id, categoryName: match.name, confidence: "low", reason: `Matched the keyword "${rule.pattern.exec(normalized)?.[0]}".` };
      }
    }
  }
  return null;
}
