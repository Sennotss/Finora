import { requireUserContext } from "@/lib/dal";
import { formatDateOnly } from "@/lib/dates";
import { FormatProvider } from "@/components/shared/format-context";
import { Skeleton } from "@/components/ui/skeleton";
import { QuickAddButton, QuickAddDialog } from "@/components/transactions/quick-add-dialog";
import { listActiveAccounts } from "@/features/accounts/service";
import { listCategories } from "@/features/categories/service";
import { runUserMaintenance } from "@/features/maintenance/service";
import { listNotifications } from "@/features/notifications/service";
import { MobileNav } from "./mobile-nav";
import { NotificationsMenu } from "./notifications-menu";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { Brand } from "./brand";

function HeaderFrame({ children }: { children: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-6 lg:px-8">
      {children}
    </header>
  );
}

export function AppHeaderSkeleton() {
  return (
    <HeaderFrame>
      <div className="lg:hidden">
        <Brand />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="size-8 rounded-full" />
      </div>
    </HeaderFrame>
  );
}

/**
 * Session-dependent chrome. Verifies the user, runs throttled housekeeping (recurring
 * transactions, reminders, snapshots) before any page data is read, and provides
 * formatting preferences and the global quick-add dialog.
 */
export async function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, ctx } = await requireUserContext();
  try {
    await runUserMaintenance(user.id);
  } catch (error) {
    console.error("[maintenance]", error);
  }
  const [accounts, categories, notifications] = await Promise.all([listActiveAccounts(user.id), listCategories(user.id), listNotifications(user.id)]);

  return (
    <FormatProvider currency={ctx.baseCurrency} locale={ctx.locale}>
      <HeaderFrame>
        <MobileNav />
        <div className="lg:hidden">
          <Brand />
        </div>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <QuickAddButton />
          <NotificationsMenu
            unread={notifications.unread}
            items={notifications.items.map((n) => ({ id: n.id, type: n.type, title: n.title, message: n.message, link: n.link, read: n.readAt !== null, createdAt: n.createdAt.toISOString() }))}
          />
          <ThemeToggle />
          <UserMenu name={user.name} email={user.email} />
        </div>
      </HeaderFrame>
      <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
      <QuickAddDialog accounts={accounts} categories={categories} locale={ctx.locale} today={formatDateOnly(ctx.today)} />
    </FormatProvider>
  );
}
