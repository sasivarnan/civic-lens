import { beforeEach, expect, it, vi } from "vitest";
import type { Context, Next } from "hono";
const state = vi.hoisted(() => ({
  allowed: true,
  rows: [] as any[],
  queries: [] as { query: string; values: any[] }[],
}));
vi.mock("../src/auth.js", async (original) => ({
  ...(await original<typeof import("../src/auth.js")>()),
  authConfig: async (_c: Context, next: Next) => next(),
  admin: async () => {
    if (!state.allowed) {
      const { HttpError } = await import("../src/security.js");
      throw new HttpError(403, "Admin access is required.");
    }
    return { id: "queue-admin" };
  },
}));
vi.mock("../src/db.js", () => ({
  db: {},
  sql: (strings: TemplateStringsArray, ...values: any[]) => {
    const query = strings.join("?");
    state.queries.push({ query, values });
    return query.includes("SELECT id,title,category,status,demo")
      ? state.rows
      : { query, values };
  },
}));
import { app } from "../src/app.js";
beforeEach(() =>
  Object.assign(state, { allowed: true, rows: [], queries: [] }),
);
it("requires admin access before reading the case queue", async () => {
  state.allowed = false;
  expect((await app.request("/api/moderation/cases")).status).toBe(403);
  expect(state.queries).toHaveLength(0);
});
it("defaults to public unassigned cases and rejects caching", async () => {
  const response = await app.request("/api/moderation/cases");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ cases: [], nextCursor: null });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(
    state.queries.some((item) => item.query.includes("visibility='public'")),
  ).toBe(true);
  expect(
    state.queries.some((item) => item.values.includes("not_assigned")),
  ).toBe(true);
});
it("returns safe fields and a cursor with full timestamp precision", async () => {
  state.rows = Array.from({ length: 26 }, (_, index) => ({
    id: `8f102b20-6654-4b79-9de6-${String(index).padStart(12, "0")}`,
    title: "Demo queue case",
    category: "pothole",
    status: "reported",
    demo: true,
    created_at: new Date("2026-10-18T06:00:00Z"),
    cursor_time: "2026-10-18T06:00:00.123456Z",
    case_progress: null,
    email: "private@example.com",
  }));
  const result = await (
    await app.request("/api/moderation/cases?stage=all")
  ).json();
  expect(result.cases).toHaveLength(25);
  expect(result.cases[0]).not.toHaveProperty("email");
  expect(
    JSON.parse(Buffer.from(result.nextCursor, "base64url").toString()),
  ).toEqual({
    createdAt: "2026-10-18T06:00:00.123456Z",
    id: state.rows[24].id,
  });
  expect(
    (
      await app.request(
        "/api/moderation/cases?stage=all&cursor=" + result.nextCursor,
      )
    ).status,
  ).toBe(200);
  expect(
    state.queries.some((item) => item.query.includes("(created_at,id)<")),
  ).toBe(true);
});
it.each([
  "stage=unsupported",
  "cursor=broken",
  "cursor=" +
    Buffer.from(JSON.stringify({ createdAt: "bad", id: "bad" })).toString(
      "base64url",
    ),
])("rejects invalid queue query %s", async (query) => {
  expect((await app.request("/api/moderation/cases?" + query)).status).toBe(
    400,
  );
  expect(state.queries).toHaveLength(0);
});
