import "server-only";
import { db } from "@/lib/db";

export type NotificationDraft = {
  type: "BUDGET_ALERT" | "BILL_DUE" | "BILL_OVERDUE" | "GOAL" | "SYSTEM";
  title: string;
  message: string;
  link?: string;
  dedupeKey: string;
};

/** Inserts notifications, silently skipping any whose dedupe key already exists. */
export async function pushNotifications(userId: string, drafts: NotificationDraft[]) {
  if (drafts.length === 0) return 0;
  const r = await db.notification.createMany({ data: drafts.map((d) => ({ ...d, userId })), skipDuplicates: true });
  return r.count;
}

export async function listNotifications(userId: string, take = 20) {
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, unread };
}

export async function markNotificationRead(userId: string, id: string) {
  await db.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
}

export async function markAllNotificationsRead(userId: string) {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
