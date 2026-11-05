import { ArrowLeftRight, BarChart3, BookOpen, CalendarClock, LayoutDashboard, LineChart, PiggyBank, Settings, Target, Wallet, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV_ITEMS: NavItem[] = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/budgets", label: "Budgets", icon: PiggyBank },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/goals", label: "Financial Goals", icon: Target },
  { href: "/bills", label: "Bills & Subscriptions", icon: CalendarClock },
  { href: "/planning", label: "Financial Planning", icon: LineChart },
  { href: "/journal", label: "Financial Journal", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];
