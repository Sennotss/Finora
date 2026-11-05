import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { CategoryManager, DeleteAccountSection, ExchangeRates, PasswordForm, PreferencesForm, ProfileForm, TagManager } from "@/components/settings/settings-forms";
import { requireUserContext } from "@/lib/dal";
import { formatDateOnly } from "@/lib/dates";
import { listCategories } from "@/features/categories/service";
import { getSettings } from "@/features/settings/service";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Profile, preferences, categories and data." />
      <Suspense fallback={<LoadingSkeleton variant="table" />}>
        <Settings />
      </Suspense>
    </div>
  );
}

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

async function Settings() {
  const { user, ctx } = await requireUserContext();
  const [{ user: profile, settings, rates, tags }, categories] = await Promise.all([getSettings(user.id), listCategories(user.id)]);
  return (
    <div className="space-y-4">
      <Section title="Profile"><ProfileForm initial={{ name: profile.name, email: profile.email }} /></Section>
      <Section title="Password"><PasswordForm /></Section>
      <Section title="Preferences" description="Currency, formatting, dates, budget thresholds and reminders.">
        <PreferencesForm
          initial={{
            baseCurrency: settings.baseCurrency,
            locale: settings.locale,
            timezone: settings.timezone,
            weekStartsOn: settings.weekStartsOn,
            budgetNormalThreshold: settings.budgetNormalThreshold,
            budgetModerateThreshold: settings.budgetModerateThreshold,
            budgetWarningThreshold: settings.budgetWarningThreshold,
            emergencyFundMonths: settings.emergencyFundMonths,
            billReminderDays: settings.billReminderDays,
          }}
        />
      </Section>
      <Section title="Categories" description="Organise income and expenses. Subcategories roll up into their parent in reports."><CategoryManager categories={categories} /></Section>
      <Section title="Tags"><TagManager tags={tags.map((t) => ({ id: t.id, name: t.name, count: t._count.transactions }))} /></Section>
      <Section id="exchange-rates" title="Exchange rates" description="Needed when you hold accounts in more than one currency.">
        <ExchangeRates baseCurrency={ctx.baseCurrency} today={formatDateOnly(ctx.today)} rates={rates.map((r) => ({ id: r.id, fromCurrency: r.fromCurrency, toCurrency: r.toCurrency, rate: r.rate.toString(), date: formatDateOnly(r.date) }))} />
      </Section>
      <Section title="Your data" description="Export everything or import from another app.">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><a href="/api/transactions/export?format=csv" download><Download /> All transactions (CSV)</a></Button>
          <Button variant="outline" asChild><a href="/api/transactions/export?format=xlsx" download><Download /> All transactions (Excel)</a></Button>
          <Button variant="outline" asChild><Link href="/transactions/import"><Upload /> Import transactions</Link></Button>
        </div>
      </Section>
      <Section title="Danger zone" description={`Member since ${profile.createdAt.toLocaleDateString()}.`}><DeleteAccountSection /></Section>
    </div>
  );
}
