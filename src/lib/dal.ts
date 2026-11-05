import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { createConverter, type Converter } from "./currency";
import { db } from "./db";
import { todayInTimeZone } from "./dates";
import { DEFAULT_THRESHOLDS, type BudgetThresholds } from "@/features/budgets/calculations";

export type SessionUser = { id: string; name: string; email: string };

/**
 * Data access layer entry point. Verifies the session against the database once per
 * request (sessions are invalidated when `sessionVersion` changes, e.g. on password change).
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await db.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, sessionVersion: true } });
  if (!user || user.sessionVersion !== (session.sessionVersion ?? 0)) return null;
  return { id: user.id, name: user.name, email: user.email };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export type UserContext = {
  userId: string;
  baseCurrency: string;
  locale: string;
  timezone: string;
  weekStartsOn: number;
  thresholds: BudgetThresholds;
  emergencyFundMonths: number;
  billReminderDays: number;
  today: Date;
  converter: Converter;
};

export const getUserContext = cache(async (userId: string): Promise<UserContext> => {
  const [settings, rates] = await Promise.all([
    db.userSettings.upsert({ where: { userId }, create: { userId }, update: {} }),
    db.exchangeRate.findMany({ where: { userId }, select: { fromCurrency: true, toCurrency: true, rate: true, date: true } }),
  ]);
  return {
    userId,
    baseCurrency: settings.baseCurrency,
    locale: settings.locale,
    timezone: settings.timezone,
    weekStartsOn: settings.weekStartsOn,
    thresholds: {
      normal: settings.budgetNormalThreshold ?? DEFAULT_THRESHOLDS.normal,
      moderate: settings.budgetModerateThreshold ?? DEFAULT_THRESHOLDS.moderate,
      warning: settings.budgetWarningThreshold ?? DEFAULT_THRESHOLDS.warning,
    },
    emergencyFundMonths: settings.emergencyFundMonths,
    billReminderDays: settings.billReminderDays,
    today: todayInTimeZone(settings.timezone),
    converter: createConverter(settings.baseCurrency, rates),
  };
});

/** Convenience for pages: the verified user plus their preferences. */
export async function requireUserContext() {
  const user = await requireUser();
  const ctx = await getUserContext(user.id);
  return { user, ctx };
}
