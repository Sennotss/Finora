import "server-only";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { db } from "./db";
import { getDummyHash, verifyPassword } from "./password";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

class InvalidCredentials extends CredentialsSignin {
  code = "invalid_credentials";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) throw new InvalidCredentials();
        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
          select: { id: true, name: true, email: true, passwordHash: true, sessionVersion: true },
        });
        if (!user) {
          await verifyPassword(await getDummyHash(), parsed.data.password);
          throw new InvalidCredentials();
        }
        if (!(await verifyPassword(user.passwordHash, parsed.data.password))) throw new InvalidCredentials();
        return { id: user.id, name: user.name, email: user.email, sessionVersion: user.sessionVersion };
      },
    }),
  ],
});
