"use client";

import Link from "next/link";
import { Bell, CalendarClock, PiggyBank, Target, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/features/notifications/actions";
import { cn } from "@/lib/utils";

export type NotificationItem = { id: string; type: string; title: string; message: string; link: string | null; read: boolean; createdAt: string };

const ICON = { BUDGET_ALERT: PiggyBank, BILL_DUE: CalendarClock, BILL_OVERDUE: CalendarClock, GOAL: Target, SYSTEM: Info } as Record<string, typeof Info>;

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationsMenu({ items, unread }: { items: NotificationItem[]; unread: number }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
          <Bell />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-sm font-medium">Notifications</p>
          {unread > 0 && (
            <Button variant="link" size="xs" onClick={() => void markAllNotificationsReadAction()}>
              Mark all read
            </Button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          <ScrollArea className="max-h-96">
            <ul className="divide-y">
              {items.map((n) => {
                const Icon = ICON[n.type] ?? Info;
                const body = (
                  <div className={cn("flex gap-2.5 px-3 py-2.5 text-left", !n.read && "bg-primary/5")}>
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className={cn("text-sm", !n.read && "font-medium")}>{n.title}</p>
                      <p className="text-xs text-muted-foreground">{n.message}</p>
                      <p className="text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} className="block hover:bg-muted" onClick={() => !n.read && void markNotificationReadAction(n.id)}>
                        {body}
                      </Link>
                    ) : (
                      <button type="button" className="block w-full hover:bg-muted" onClick={() => !n.read && void markNotificationReadAction(n.id)}>
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
