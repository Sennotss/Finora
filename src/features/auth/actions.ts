"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action";
import { loginSchema } from "./schemas";
import { registerUser } from "./service";

function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function registerAction(input: unknown, timezone?: string): Promise<ActionResult<{ email: string }>> {
  const result = await runAction(() => registerUser(input, isValidTimeZone(timezone) ? timezone : "Asia/Jakarta"));
  if (!result.ok) return result;
  const { password } = input as { password: string };
  await signIn("credentials", { email: result.data.email, password, redirectTo: "/overview" });
  return { ok: true, data: { email: result.data.email } };
}

export async function loginAction(input: unknown, callbackUrl?: string): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter your email and password." };
  // Only allow same-site relative redirects.
  const redirectTo = callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/overview";
  try {
    await signIn("credentials", { ...parsed.data, redirectTo });
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, error: "Invalid email or password." };
    throw error; // includes the redirect thrown by a successful sign-in
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
