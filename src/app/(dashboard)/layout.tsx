import { Suspense } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeaderSkeleton, DashboardShell } from "@/components/layout/dashboard-shell";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense
          fallback={
            <>
              <AppHeaderSkeleton />
              <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
                <LoadingSkeleton />
              </main>
            </>
          }
        >
          <DashboardShell>{children}</DashboardShell>
        </Suspense>
      </div>
    </div>
  );
}
