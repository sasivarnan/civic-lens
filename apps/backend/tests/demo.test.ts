import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Context, Next } from "hono";
const state = vi.hoisted(() => ({
  users: new Map<string, { id: string; name: string; role: string }>(),
  sessions: new Map<string, { id: string; expires: Date }>(),
  authId: "",
}));
vi.mock("@hono/auth-js", () => ({
  initAuthConfig: () => async (_c: Context, next: Next) => next(),
  authHandler: () => async (c: Context) => c.json({}),
  getAuthUser: async () => state.authId ? { user: { id: state.authId } } : null,
}));
vi.mock("../src/db.js", () => {
  const sql = Object.assign(async (strings: TemplateStringsArray, ...values: any[]) => {
    const query = strings.join("?");
    if (query.includes("INSERT INTO users")) state.users.set(values[0], { id: values[0], name: "Demo visitor", role: "member" });
    if (query.includes("INSERT INTO sessions")) state.sessions.set(values[0], { id: values[1], expires: values[2] });
    if (query.includes("JOIN member_profiles")) {
      const session = state.sessions.get(values[0]);
      const user = session && state.users.get(session.id);
      return session && session.expires > new Date() && user?.role === "member" ? [user] : [];
    }
    if (query.includes("SELECT id,name,role FROM users")) return [state.users.get(values[0])].filter(Boolean);
    return [];
  }, { begin: async (callback: (tx: unknown) => unknown) => callback(sql) });
  return { sql, db: {} };
});
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { admin, member } from "../src/auth.js";
import { Hono } from "hono";
const access = new Hono();
access.get("/member", async (c) => c.json(await member(c)));
access.get("/admin", async (c) => c.json(await admin(c)));
access.onError((error: any, c) => c.json({ error: error.message }, error.status));
const originalMode = config.DEMO_MODE;
beforeEach(() => {
  config.DEMO_MODE = true;
  state.users.clear(); state.sessions.clear(); state.authId = "";
});
afterEach(() => { config.DEMO_MODE = originalMode; });
async function start(cookie?: string) {
  return app.request("/api/demo-session", {
    method: "POST", headers: { origin: config.APP_ORIGIN, ...(cookie ? { cookie } : {}) },
  });
}
const cookieOf = (response: Response) => response.headers.get("set-cookie")!.split(";")[0]!;
it("does not create a member on a session read", async () => {
  const response = await app.request("/api/auth/session");
  expect(await response.json()).toEqual({ demoMode: true });
  expect(state.users.size).toBe(0);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("creates separate members, hashes tokens, and reuses a valid cookie", async () => {
  const first = await start();
  const firstBody = await first.json();
  const cookie = cookieOf(first);
  expect(first.headers.get("set-cookie")).toContain("HttpOnly");
  expect(first.headers.get("set-cookie")).toContain("SameSite=Lax");
  expect(first.headers.get("set-cookie")).toContain("Max-Age=86400");
  expect([...state.sessions.keys()][0]).not.toContain(cookie.split("=")[1]);
  expect(await (await start(cookie)).json()).toEqual(firstBody);
  expect((await (await start()).json()).user.id).not.toBe(firstBody.user.id);
  expect(state.users.size).toBe(2);
  expect((await (await access.request("/member", { headers: { cookie } })).json()).demo).toBe(true);
});
it("rejects foreign origins before it creates an account", async () => {
  const response = await app.request("/api/demo-session", { method: "POST", headers: { origin: "https://other.example" } });
  expect(response.status).toBe(403);
  expect(state.users.size).toBe(0);
});
it("rejects expired and changed tokens", async () => {
  const cookie = cookieOf(await start());
  for (const session of state.sessions.values()) session.expires = new Date(0);
  expect((await access.request("/member", { headers: { cookie } })).status).toBe(401);
  expect((await access.request("/member", { headers: { cookie: "civiclens-demo=" + "a".repeat(64) } })).status).toBe(401);
});
it("disables new and existing demo sessions when the flag is false", async () => {
  const cookie = cookieOf(await start());
  config.DEMO_MODE = false;
  expect((await start()).status).toBe(404);
  expect((await access.request("/member", { headers: { cookie } })).status).toBe(401);
  expect(state.users.size).toBe(1);
});
it("requires a real admin session and gives real sessions priority", async () => {
  const cookie = cookieOf(await start());
  expect((await access.request("/admin", { headers: { cookie } })).status).toBe(401);
  state.authId = "real-admin";
  state.users.set(state.authId, { id: state.authId, name: "Admin", role: "admin" });
  expect((await access.request("/admin", { headers: { cookie } })).status).toBe(200);
  expect((await (await start(cookie)).json()).user.id).toBe("real-admin");
  state.users.get(state.authId)!.role = "member";
  expect((await access.request("/admin", { headers: { cookie } })).status).toBe(403);
});
it("uses a secure cookie on HTTPS", async () => {
  const original = config.APP_ORIGIN;
  config.APP_ORIGIN = "https://demo.example";
  try { expect((await start()).headers.get("set-cookie")).toContain("Secure"); }
  finally { config.APP_ORIGIN = original; }
});
