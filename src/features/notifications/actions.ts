"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/dal";
import { markAllNotificationsRead, markNotificationRead } from "./service";

export async function markNotificationReadAction(id: string) {
  const user = await requireUser();
  await markNotificationRead(user.id, id);
  refresh();
}

export async function markAllNotificationsReadAction() {
  const user = await requireUser();
  await markAllNotificationsRead(user.id);
  refresh();
}
