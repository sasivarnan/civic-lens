import { randomBytes, randomUUID, createHash } from "node:crypto";
import { getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import { config } from "./config.js";
import { sql } from "./db.js";
import { HttpError } from "./security.js";

const cookieName = "civiclens-demo";
const lifetime = 24 * 60 * 60;
const tokenKey = (token: string) => "demo:" + createHash("sha256").update(token).digest("hex");
export type DemoMember = { id: string; name: string; role: "member"; demo: true };

export async function demoMember(c: Context): Promise<DemoMember | null> {
  if (!config.DEMO_MODE) return null;
  const token = getCookie(c, cookieName);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [user] = await sql`
    SELECT u.id,u.name FROM sessions s
    JOIN users u ON u.id=s.user_id
    JOIN member_profiles p ON p.user_id=u.id
    WHERE s.session_token=${tokenKey(token)} AND s.expires>now()
      AND p.demo=true AND u.role='member'`;
  return user ? { id: user.id, name: user.name, role: "member", demo: true } : null;
}

export async function createDemoMember(c: Context): Promise<DemoMember> {
  if (!config.DEMO_MODE) throw new HttpError(404, "Demo mode is disabled.");
  const token = randomBytes(32).toString("hex");
  const id = randomUUID();
  const expires = new Date(Date.now() + lifetime * 1000);
  await sql.begin(async (tx) => {
    await tx`INSERT INTO users(id,name,role) VALUES(${id},'Demo visitor','member')`;
    await tx`INSERT INTO member_profiles(user_id,demo) VALUES(${id},true)`;
    await tx`INSERT INTO sessions(session_token,user_id,expires) VALUES(${tokenKey(token)},${id},${expires})`;
  });
  setCookie(c, cookieName, token, {
    httpOnly: true, sameSite: "Lax", path: "/", maxAge: lifetime,
    secure: config.APP_ORIGIN.startsWith("https://"),
  });
  return { id, name: "Demo visitor", role: "member", demo: true };
}
