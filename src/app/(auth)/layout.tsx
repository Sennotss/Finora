import { Brand } from "@/components/layout/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-4 py-6 sm:px-8">
        <Brand />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
      <aside className="relative hidden overflow-hidden border-l bg-sidebar lg:flex lg:flex-col lg:justify-end lg:p-12">
        <svg className="absolute inset-x-12 top-24 h-64 text-primary/70" viewBox="0 0 400 200" fill="none" aria-hidden>
          <path d="M0 160 C60 150 80 120 130 125 S210 90 250 70 S330 60 400 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M0 160 C60 150 80 120 130 125 S210 90 250 70 S330 60 400 20 V200 H0Z" fill="currentColor" opacity="0.08" />
          {[[130, 125], [250, 70], [400, 20]].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="4" fill="currentColor" stroke="var(--sidebar)" strokeWidth="2" />
          ))}
        </svg>
        <blockquote className="relative max-w-md space-y-3">
          <p className="text-2xl font-semibold tracking-tight">Understand where your money goes — and where it could go next.</p>
          <p className="text-sm text-muted-foreground">Track accounts, budgets and goals, spot unusual spending, and plan ahead with projections built from your real data.</p>
        </blockquote>
      </aside>
    </div>
  );
}
