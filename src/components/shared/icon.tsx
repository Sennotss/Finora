import {
  Banknote,
  Briefcase,
  Car,
  CircleDollarSign,
  CircleEllipsis,
  CirclePlus,
  CreditCard,
  FileText,
  Film,
  Gift,
  GraduationCap,
  HandCoins,
  Heart,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  Percent,
  PiggyBank,
  Plane,
  Receipt,
  Repeat,
  RotateCcw,
  Shield,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Store,
  Tag,
  TrendingUp,
  Users,
  Utensils,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Curated icon set for categories and accounts (stored by name in the database). */
export const ICONS: Record<string, LucideIcon> = {
  wallet: Wallet,
  landmark: Landmark,
  smartphone: Smartphone,
  "piggy-bank": PiggyBank,
  "trending-up": TrendingUp,
  "credit-card": CreditCard,
  "hand-coins": HandCoins,
  banknote: Banknote,
  briefcase: Briefcase,
  "circle-dollar-sign": CircleDollarSign,
  gift: Gift,
  laptop: Laptop,
  store: Store,
  percent: Percent,
  heart: Heart,
  "rotate-ccw": RotateCcw,
  "plus-circle": CirclePlus,
  utensils: Utensils,
  car: Car,
  home: House,
  zap: Zap,
  repeat: Repeat,
  "shopping-bag": ShoppingBag,
  "heart-pulse": HeartPulse,
  shield: Shield,
  "graduation-cap": GraduationCap,
  film: Film,
  plane: Plane,
  sparkles: Sparkles,
  users: Users,
  receipt: Receipt,
  "file-text": FileText,
  "circle-ellipsis": CircleEllipsis,
  tag: Tag,
};

export const ICON_NAMES = Object.keys(ICONS);

export function AppIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  const Icon = (name && ICONS[name]) || Tag;
  return <Icon className={className} aria-hidden />;
}

/** Icon on a soft tint of an entity colour (category, account). */
export function IconBadge({ name, color, className, size = "md" }: { name: string | null | undefined; color: string; className?: string; size?: "sm" | "md" | "lg" }) {
  const dims = size === "sm" ? "size-7" : size === "lg" ? "size-11" : "size-9";
  const icon = size === "sm" ? "size-3.5" : size === "lg" ? "size-5" : "size-4";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-lg", dims, className)}
      style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
    >
      <AppIcon name={name} className={icon} />
    </span>
  );
}
