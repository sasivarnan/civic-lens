import { initAuthConfig, authHandler, getAuthUser } from "@hono/auth-js";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Nodemailer from "@auth/core/providers/nodemailer";
import { db, sql } from "./db.js";
import { users, accounts, sessions, verificationTokens } from "./schema.js";
import { config } from "./config.js";
import { HttpError } from "./security.js";
import type { Context } from "hono";
// Use the configured origin for sign-in links, independent of proxy headers.
process.env.AUTH_URL = config.APP_ORIGIN + "/api/auth";
export const authConfig = initAuthConfig(() => ({
  secret: config.AUTH_SECRET,
  trustHost: true,
  basePath: "/api/auth",
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database", maxAge: 60 * 60 * 24 * 7 },
  providers: [
    Nodemailer({
      server: config.EMAIL_SERVER,
      from: config.EMAIL_FROM,
      maxAge: 15 * 60,
    }),
  ],
  pages: {
    signIn: "/sign-in",
    verifyRequest: "/sign-in?sent=true",
    error: "/sign-in?error=auth",
  },
  callbacks: {
    async session({ session, user }) {
      const [row] = await sql`SELECT role FROM users WHERE id=${user.id}`;
      return {
        ...session,
        user: { id: user.id, name: user.name, role: row?.role ?? "member" },
      };
    },
    redirect({ url }) {
      try {
        const parsed = new URL(url, config.APP_ORIGIN);
        return parsed.origin === config.APP_ORIGIN
          ? parsed.toString()
          : config.APP_ORIGIN;
      } catch {
        return config.APP_ORIGIN;
      }
    },
  },
}));
export { authHandler };
export async function member(c: Context) {
  const auth = await getAuthUser(c);
  const id = auth?.user?.id ?? (auth?.session?.user as any)?.id;
  if (!id) throw new HttpError(401, "Sign in before continuing.");
  const [u] = await sql`SELECT id,name,role FROM users WHERE id=${id}`;
  if (!u) throw new HttpError(401, "Sign in before continuing.");
  return u as { id: string; name: string | null; role: string };
}
export async function admin(c: Context) {
  const u = await member(c);
  if (u.role !== "admin") throw new HttpError(403, "Admin access is required.");
  return u;
}
