/**
 * Demo data: one user with ~7 months of realistic, deterministic activity.
 *   Email:    demo@finora.app
 *   Password: Demo12345
 *
 * Re-running the seed replaces the demo user (other users are untouched).
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "../src/features/categories/defaults";
import { addDays, addMonths, dateOnly, endOfMonth, formatDateOnly, startOfMonth, todayInTimeZone } from "../src/lib/dates";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const DEMO_EMAIL = "demo@finora.app";
const DEMO_PASSWORD = "Demo12345";
const TZ = "Asia/Jakarta";

// Deterministic PRNG (mulberry32) so every seed produces the same data.
let state = 20261029;
function rand() {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (min: number, max: number, step = 500) => Math.round((min + rand() * (max - min)) / step) * step;
const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
const chance = (p: number) => rand() < p;

async function main() {
  const today = todayInTimeZone(TZ);
  const start = startOfMonth(addMonths(today, -6, 1));

  const existing = await db.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    await db.$transaction([
      db.billPayment.deleteMany({ where: { userId: existing.id } }),
      db.transaction.deleteMany({ where: { userId: existing.id } }),
      db.user.delete({ where: { id: existing.id } }),
    ]);
  }

  const user = await db.user.create({
    data: {
      name: "Rani Pratama",
      email: DEMO_EMAIL,
      passwordHash: await hash(DEMO_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 }),
      settings: { create: { baseCurrency: "IDR", locale: "id-ID", timezone: TZ } },
    },
  });
  const userId = user.id;

  // Categories ---------------------------------------------------------------
  const cat: Record<string, string> = {};
  for (const [kind, list] of [["INCOME", DEFAULT_INCOME_CATEGORIES], ["EXPENSE", DEFAULT_EXPENSE_CATEGORIES]] as const) {
    for (const c of list) {
      const parent = await db.category.create({ data: { userId, name: c.name, kind, color: c.color, icon: c.icon } });
      cat[c.name] = parent.id;
      for (const child of c.children ?? []) {
        const sub = await db.category.create({ data: { userId, name: child, kind, color: c.color, icon: c.icon, parentId: parent.id } });
        cat[child] = sub.id;
      }
    }
  }

  // Accounts -------------------------------------------------------------------
  const account = async (data: Omit<Prisma.AccountUncheckedCreateInput, "userId">) => (await db.account.create({ data: { ...data, userId } })).id;
  const bca = await account({ name: "BCA Payroll", type: "BANK", currency: "IDR", openingBalance: "8500000", openingDate: start, institution: "Bank Central Asia", color: "#2a78d6", icon: "landmark" });
  const cash = await account({ name: "Cash", type: "CASH", currency: "IDR", openingBalance: "600000", openingDate: start, color: "#1baf7a", icon: "banknote" });
  const gopay = await account({ name: "GoPay", type: "E_WALLET", currency: "IDR", openingBalance: "150000", openingDate: start, institution: "Gojek", color: "#0ea5e9", icon: "smartphone" });
  const jago = await account({ name: "Jago Savings", type: "SAVINGS", currency: "IDR", openingBalance: "15000000", openingDate: start, institution: "Bank Jago", color: "#eda100", icon: "piggy-bank" });
  const bibit = await account({ name: "Bibit Mutual Funds", type: "INVESTMENT", currency: "IDR", openingBalance: "25000000", openingDate: start, institution: "Bibit", color: "#6250d6", icon: "trending-up" });
  const card = await account({ name: "BCA Credit Card", type: "CREDIT_CARD", currency: "IDR", openingBalance: "-1250000", openingDate: start, institution: "Bank Central Asia", color: "#e34948", icon: "credit-card", creditLimit: "15000000" });
  const wise = await account({ name: "Wise USD", type: "BANK", currency: "USD", openingBalance: "420", openingDate: start, institution: "Wise", color: "#008300", icon: "circle-dollar-sign" });
  await db.exchangeRate.create({ data: { userId, fromCurrency: "USD", toCurrency: "IDR", rate: "16250", date: start } });

  // Transactions ---------------------------------------------------------------
  const txs: Prisma.TransactionCreateManyInput[] = [];
  const add = (t: Omit<Prisma.TransactionCreateManyInput, "userId" | "currency" | "id"> & { currency?: string; id?: string }) => {
    if ((t.date as Date).getTime() > today.getTime()) return null;
    const id = t.id ?? randomUUID();
    txs.push({ currency: "IDR", ...t, id, userId, amount: String(t.amount) });
    return id;
  };

  // Recurring templates: salary, savings transfer, investment transfer.
  const salary = await db.recurringTransaction.create({
    data: { userId, description: "Salary — PT Nusantara Digital", type: "INCOME", amount: "15000000", accountId: bca, categoryId: cat["Salary"], paymentMethod: "BANK_TRANSFER", frequency: "MONTHLY", interval: 1, startDate: dateOnly(start.getUTCFullYear(), start.getUTCMonth(), 25), nextRunDate: start },
  });
  const saving = await db.recurringTransaction.create({
    data: { userId, description: "Monthly savings", type: "TRANSFER", amount: "2000000", accountId: bca, destinationAccountId: jago, frequency: "MONTHLY", interval: 1, startDate: dateOnly(start.getUTCFullYear(), start.getUTCMonth(), 26), nextRunDate: start },
  });
  const investing = await db.recurringTransaction.create({
    data: { userId, description: "Mutual fund top-up", type: "TRANSFER", amount: "1000000", accountId: bca, destinationAccountId: bibit, frequency: "MONTHLY", interval: 1, startDate: dateOnly(start.getUTCFullYear(), start.getUTCMonth(), 27), nextRunDate: start },
  });
  for (const tpl of [salary, saving, investing]) {
    let d = tpl.startDate;
    while (d.getTime() <= today.getTime()) {
      add({ type: tpl.type, amount: tpl.amount.toString(), date: d, description: tpl.description, accountId: tpl.accountId, destinationAccountId: tpl.destinationAccountId, categoryId: tpl.categoryId, paymentMethod: tpl.paymentMethod, recurringTransactionId: tpl.id, recurrenceDate: d });
      d = addMonths(d, 1, tpl.startDate.getUTCDate());
    }
    await db.recurringTransaction.update({ where: { id: tpl.id }, data: { nextRunDate: d } });
  }

  // Bills with payment history.
  type BillSpec = { name: string; amount: () => number; day: number; account: string; category: string; subscription?: boolean; method: Prisma.TransactionCreateManyInput["paymentMethod"] };
  const billSpecs: BillSpec[] = [
    { name: "Apartment rent", amount: () => 3500000, day: 1, account: bca, category: "Rent", method: "BANK_TRANSFER" },
    { name: "PLN electricity", amount: () => between(380000, 620000, 1000), day: 8, account: bca, category: "Electricity", method: "BANK_TRANSFER" },
    { name: "IndiHome internet", amount: () => 385000, day: 12, account: bca, category: "Internet", method: "BANK_TRANSFER" },
    { name: "Telkomsel postpaid", amount: () => 150000, day: 15, account: gopay, category: "Phone", method: "E_WALLET" },
    { name: "Netflix", amount: () => 65990, day: 18, account: card, category: "Subscriptions", subscription: true, method: "CREDIT_CARD" },
    { name: "Spotify Premium", amount: () => 54990, day: 21, account: card, category: "Subscriptions", subscription: true, method: "CREDIT_CARD" },
    { name: "BPJS Kesehatan", amount: () => 150000, day: 10, account: bca, category: "Insurance", method: "BANK_TRANSFER" },
  ];
  const billPayments: Prisma.BillPaymentCreateManyInput[] = [];
  for (const spec of billSpecs) {
    const firstDue = dateOnly(start.getUTCFullYear(), start.getUTCMonth(), spec.day);
    const bill = await db.bill.create({
      data: { userId, name: spec.name, amount: String(spec.amount()), currency: "IDR", accountId: spec.account, categoryId: cat[spec.category], frequency: "MONTHLY", interval: 1, nextDueDate: firstDue, isSubscription: spec.subscription ?? false, reminderDays: 3 },
    });
    let due = firstDue;
    // Pay every bill whose due date has passed, except leave one recent bill unpaid (overdue).
    while (due.getTime() < today.getTime() && !(spec.name === "PLN electricity" && due.getTime() > addDays(today, -6).getTime())) {
      const amount = spec.amount();
      const paid = addDays(due, -Math.floor(rand() * 3));
      const txId = add({ type: "EXPENSE", amount, date: paid, description: spec.name, accountId: spec.account, categoryId: cat[spec.category], paymentMethod: spec.method, notes: `Bill payment for due date ${formatDateOnly(due)}` });
      if (txId) billPayments.push({ billId: bill.id, userId, dueDate: due, paidDate: paid, amount: String(amount), transactionId: txId });
      due = addMonths(due, 1, spec.day);
    }
    await db.bill.update({ where: { id: bill.id }, data: { nextDueDate: due } });
  }
  await db.bill.create({ data: { userId, name: "Car insurance", amount: "4800000", currency: "IDR", accountId: bca, categoryId: cat["Insurance"], frequency: "ANNUALLY", interval: 1, nextDueDate: addDays(today, 40), reminderDays: 14 } });

  // Day-to-day spending.
  const groceries = ["Superindo", "Hypermart", "Indomaret", "Alfamart", "Pasar Santa"];
  const restaurants = ["Warung Bu Rudy", "Sate Khas Senayan", "GrabFood — Ayam Geprek", "GoFood — Bakso Boedjangan", "Sushi Tei", "Kopi Kenangan", "Starbucks"];
  for (let d = start; d.getTime() <= today.getTime(); d = addDays(d, 1)) {
    const dow = d.getUTCDay();
    if (dow === 6 || (dow === 3 && chance(0.4))) add({ type: "EXPENSE", amount: between(250000, 750000), date: d, description: "Groceries", merchant: pick(groceries), accountId: chance(0.7) ? bca : card, categoryId: cat["Groceries"], paymentMethod: "DEBIT_CARD" });
    if (chance(0.55)) {
      const place = pick(restaurants);
      const coffee = /kopi|starbucks/i.test(place);
      add({ type: "EXPENSE", amount: coffee ? between(28000, 65000, 1000) : between(35000, 180000, 1000), date: d, description: coffee ? "Coffee" : "Meal", merchant: place, accountId: chance(0.6) ? gopay : cash, categoryId: cat[coffee ? "Coffee & Snacks" : "Restaurants"], paymentMethod: chance(0.6) ? "E_WALLET" : "CASH" });
    }
    if (dow >= 1 && dow <= 5 && chance(0.6)) add({ type: "EXPENSE", amount: between(15000, 55000, 1000), date: d, description: "Gojek ride", merchant: "Gojek", accountId: gopay, categoryId: cat["Ride Hailing"], paymentMethod: "E_WALLET" });
    if (dow === 0 && chance(0.7)) add({ type: "EXPENSE", amount: between(150000, 300000, 1000), date: d, description: "Fuel", merchant: "Pertamina", accountId: cash, categoryId: cat["Fuel"], paymentMethod: "CASH" });
    if (chance(0.08)) add({ type: "EXPENSE", amount: between(150000, 900000, 1000), date: d, description: pick(["Tokopedia order", "Shopee order", "Uniqlo"]), accountId: card, categoryId: cat[pick(["Clothing", "Household", "Shopping"])], paymentMethod: "CREDIT_CARD" });
    if (chance(0.05)) add({ type: "EXPENSE", amount: between(60000, 250000, 1000), date: d, description: pick(["Cinema XXI", "Steam game", "Concert ticket"]), accountId: card, categoryId: cat["Entertainment"], paymentMethod: "CREDIT_CARD" });
    if (chance(0.03)) add({ type: "EXPENSE", amount: between(50000, 400000, 1000), date: d, description: pick(["Kimia Farma", "Klinik check-up"]), accountId: bca, categoryId: cat[pick(["Pharmacy", "Medical"])], paymentMethod: "DEBIT_CARD" });
    if (d.getUTCDate() === 3 || d.getUTCDate() === 17) add({ type: "TRANSFER", amount: 500000, date: d, description: "GoPay top-up", accountId: bca, destinationAccountId: gopay, paymentMethod: "BANK_TRANSFER" });
    if (d.getUTCDate() === 5) add({ type: "TRANSFER", amount: 1000000, date: d, description: "ATM withdrawal", accountId: bca, destinationAccountId: cash });
    if (d.getUTCDate() === 9) add({ type: "EXPENSE", amount: 59000, date: d, description: "YouTube Premium", merchant: "Google", accountId: card, categoryId: cat["Subscriptions"], paymentMethod: "CREDIT_CARD" });
    if (d.getUTCDate() === 14 && chance(0.6)) add({ type: "INCOME", amount: between(1500000, 4000000, 50000), date: d, description: "Freelance design project", accountId: bca, categoryId: cat["Freelance"], paymentMethod: "BANK_TRANSFER" });
    if (d.getUTCDate() === 20 && chance(0.5)) add({ type: "INCOME", amount: between(80, 200, 1), currency: "USD", date: d, description: "Upwork payout", accountId: wise, categoryId: cat["Freelance"], paymentMethod: "BANK_TRANSFER" });
  }

  // Credit-card repayment each month: pay last month's card spending (a transfer, not an expense).
  for (let m = addMonths(start, 1, 1); m.getTime() <= today.getTime(); m = addMonths(m, 1, 1)) {
    const prev = { start: addMonths(m, -1, 1), end: addDays(m, -1) };
    const spent = txs
      .filter((t) => t.accountId === card && t.type === "EXPENSE" && (t.date as Date) >= prev.start && (t.date as Date) <= prev.end)
      .reduce((a, t) => a + Number(t.amount), 0);
    add({ type: "TRANSFER", amount: Math.round(spent + (m.getTime() === addMonths(start, 1, 1).getTime() ? 1250000 : 0)), date: addDays(m, 4), description: "Credit card repayment", accountId: bca, destinationAccountId: card, paymentMethod: "BANK_TRANSFER" });
  }

  // A few memorable one-offs (including an unusually large purchase for anomaly detection).
  add({ type: "EXPENSE", amount: 2450000, date: addDays(today, -6), description: "Anniversary dinner", merchant: "Kaum Jakarta", accountId: card, categoryId: cat["Restaurants"], paymentMethod: "CREDIT_CARD", notes: "Special occasion" });
  add({ type: "EXPENSE", amount: 1850000, date: addDays(startOfMonth(addMonths(today, -2, 1)), 10), description: "Car service", merchant: "Auto2000", accountId: bca, categoryId: cat["Vehicle Maintenance"], paymentMethod: "DEBIT_CARD" });
  add({ type: "INCOME", amount: 5000000, date: dateOnly(addMonths(today, -3, 1).getUTCFullYear(), addMonths(today, -3, 1).getUTCMonth(), 20), description: "Quarterly performance bonus", accountId: bca, categoryId: cat["Bonus"], paymentMethod: "BANK_TRANSFER" });
  add({ type: "INCOME", amount: 185000, date: endOfMonth(addMonths(today, -1, 1)), description: "Savings interest", accountId: jago, categoryId: cat["Interest"] });
  add({ type: "TRANSFER", amount: 300, destinationAmount: "4800000", date: addDays(today, -40), description: "Convert USD to IDR", currency: "USD", accountId: wise, destinationAccountId: bca });

  // Tag a handful of transactions.
  const work = await db.tag.create({ data: { userId, name: "work", color: "#2a78d6" } });
  const family = await db.tag.create({ data: { userId, name: "family", color: "#e87ba4" } });

  for (let i = 0; i < txs.length; i += 1000) await db.transaction.createMany({ data: txs.slice(i, i + 1000) });
  await db.billPayment.createMany({ data: billPayments });
  const freelance = txs.filter((t) => t.description === "Freelance design project").map((t) => ({ transactionId: t.id!, tagId: work.id }));
  const dinners = txs.filter((t) => t.description === "Anniversary dinner" || (t.description === "Groceries" && chance(0.2))).map((t) => ({ transactionId: t.id!, tagId: family.id }));
  await db.transactionTag.createMany({ data: [...freelance, ...dinners] });

  // Budgets ----------------------------------------------------------------------
  await db.budget.create({ data: { userId, name: "Monthly spending", period: "MONTHLY", amount: "11000000", startDate: start } });
  await db.budget.create({
    data: {
      userId,
      name: "Lifestyle",
      period: "MONTHLY",
      amount: "4500000",
      startDate: start,
      categories: { create: [
        { categoryId: cat["Food & Dining"], amount: "3200000" },
        { categoryId: cat["Restaurants"], amount: "1500000" },
        { categoryId: cat["Transportation"], amount: "1300000" },
        { categoryId: cat["Entertainment"], amount: "400000" },
      ] },
    },
  });
  await db.budget.create({ data: { userId, name: "Weekly groceries", period: "WEEKLY", amount: "700000", startDate: addDays(start, (8 - start.getUTCDay()) % 7), categories: { create: [{ categoryId: cat["Groceries"], amount: "700000" }] } } });

  // Goals ------------------------------------------------------------------------
  const goal = async (data: Omit<Prisma.FinancialGoalUncheckedCreateInput, "userId">, contributions: Array<[number, number, ("CONTRIBUTION" | "WITHDRAWAL")?]>) => {
    const g = await db.financialGoal.create({ data: { ...data, userId, createdAt: start } });
    await db.goalContribution.createMany({ data: contributions.map(([monthOffset, amount, type]) => ({ goalId: g.id, userId, type: type ?? "CONTRIBUTION", amount: String(amount), date: addDays(addMonths(start, monthOffset, 1), 26) })).filter((c) => c.date.getTime() <= today.getTime()) });
  };
  await goal({ name: "Emergency fund", category: "EMERGENCY_FUND", targetAmount: "60000000", priority: "HIGH", linkedAccountId: jago, color: "#1baf7a", description: "Six months of expenses" }, [[0, 20000000], [1, 1500000], [2, 1500000], [3, 2000000], [4, 1500000], [5, 2000000]]);
  await goal({ name: "New laptop", category: "PURCHASE", targetAmount: "18000000", targetDate: addMonths(today, 5, 1), priority: "MEDIUM", linkedAccountId: jago, color: "#2a78d6", description: "MacBook Air for design work" }, [[1, 2000000], [2, 1500000], [3, 1500000], [4, 500000, "WITHDRAWAL"], [5, 1000000]]);
  await goal({ name: "Bali holiday", category: "VACATION", targetAmount: "8000000", priority: "LOW", color: "#eb6834" }, [[2, 1000000], [4, 750000]]);

  // Journal -----------------------------------------------------------------------
  const lastMonth = addMonths(startOfMonth(today), -1, 1);
  await db.financialJournal.createMany({
    data: [
      { userId, type: "DECISION", title: "Moved emergency fund to Jago", content: "Higher interest and instant access. Keeping it separate from my payroll account so I'm not tempted to spend it.", entryDate: addDays(start, 3), mood: 4 },
      { userId, type: "UNEXPECTED_EXPENSE", title: "Car service bill", content: "Brake pads and a belt replacement. I should budget around Rp150k a month for car maintenance.", entryDate: addDays(startOfMonth(addMonths(today, -2, 1)), 10), amount: "1850000", mood: 2 },
      { userId, type: "LESSON", title: "Food delivery adds up", content: "GoFood/GrabFood was almost a third of my food spending. Cooking on weekdays from now on.", entryDate: addDays(lastMonth, 12), mood: 3 },
      { userId, type: "MONTHLY_REVIEW", title: `${lastMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })} review`, reviewMonth: formatDateOnly(lastMonth).slice(0, 7), wentWell: "Stayed under my monthly spending budget and topped up the emergency fund.", toImprove: "Restaurant spending crept up again in the last week.", nextPriorities: "Reach 50% on the laptop goal; cancel one streaming subscription.", content: "", entryDate: endOfMonth(lastMonth), mood: 4 },
    ],
  });

  console.log(`Seeded ${txs.length} transactions for ${DEMO_EMAIL} (password: ${DEMO_PASSWORD}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
