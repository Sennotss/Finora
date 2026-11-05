import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { runUserMaintenance } from "@/features/maintenance/service";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Daily housekeeping for every user (scheduled by Vercel Cron). Idempotent: recurring
 * transactions, notifications and snapshots are all keyed so re-runs create nothing new.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const users = await db.user.findMany({ select: { id: true } });
  let generated = 0;
  let failed = 0;
  for (const u of users) {
    try {
      const r = await runUserMaintenance(u.id, { force: true });
      if (!r.skipped) generated += r.generated;
    } catch (error) {
      failed++;
      console.error("[cron] maintenance failed for user", u.id, error);
    }
  }
  return Response.json({ users: users.length, generated, failed });
}
