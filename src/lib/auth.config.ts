import type { NextAuthConfig } from "next-auth";

const AUTH_ROUTES = ["/login", "/register"];

/**
 * Edge-safe configuration shared by the proxy and the full Auth.js instance.
 * Authorization here is a coarse first gate; every page, action and route handler
 * re-verifies the session through the data access layer.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = Boolean(auth?.user);
      const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r));
      if (isAuthRoute) {
        return isLoggedIn ? Response.redirect(new URL("/overview", request.nextUrl)) : true;
      }
      if (pathname === "/") return true;
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.sessionVersion = user.sessionVersion ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.sessionVersion = token.sessionVersion ?? 0;
      return session;
    },
  },
} satisfies NextAuthConfig;
