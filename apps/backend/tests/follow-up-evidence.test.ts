import { beforeEach, expect, it, vi } from "vitest";
import type { Context, Next } from "hono";
import sharp from "sharp";
const state = vi.hoisted(() => ({
  allowed: true,
  exists: true,
  member: "",
  old: null as any,
  writes: [] as { query: string; values: any[] }[],
  putImage: vi.fn(async () => 100),
}));
vi.mock("../src/auth.js", () => ({
  authConfig: async (_c: Context, next: Next) => next(),
  authHandler: () => async () => new Response("Unused"),
  member: async () => {
    if (!state.allowed) {
      const { HttpError } = await import("../src/security.js");
      throw new HttpError(401, "Sign in first.");
    }
    return { id: state.member, role: "member" };
  },
  admin: async () => ({ id: "admin", role: "admin" }),
}));
vi.mock("../src/db.js", () => {
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: any[]) => {
      const query = strings.join("?");
      if (query.includes("SELECT * FROM submissions"))
        return state.old ? [state.old] : [];
      if (query.includes("SELECT id FROM issues"))
        return state.exists ? [{ id: values[0] }] : [];
      state.writes.push({ query, values });
      if (query.includes("INSERT INTO submissions"))
        state.old = {
          digest: values[2],
          target_id: values[3],
          result_id: values[4],
        };
      return [];
    },
    {
      begin: async (callback: (tx: unknown) => unknown) => callback(sql),
      json: (value: unknown) => value,
    },
  );
  return { sql };
});
vi.mock("../src/media.js", async (original) => ({
  ...(await original<typeof import("../src/media.js")>()),
  putImage: state.putImage,
}));
import { app } from "../src/app.js";
import { today } from "@civiclens/shared";
const id = "8f102b20-6654-4b79-9de6-dc407f302001";
beforeEach(() => {
  Object.assign(state, {
    allowed: true,
    exists: true,
    member: crypto.randomUUID(),
    old: null,
    writes: [],
  });
  state.putImage.mockClear();
});
async function request(
  patch = {},
  key = crypto.randomUUID(),
  path = `/api/issues/${id}/evidence`,
) {
  const image = await sharp({
    create: { width: 40, height: 40, channels: 3, background: "white" },
  })
    .jpeg()
    .toBuffer();
  const body = new FormData();
  body.set("image", new File([image], "approved.jpg", { type: "image/jpeg" }));
  body.set(
    "evidence",
    JSON.stringify({
      observationDate: today(),
      imageApproved: true,
      finalApproved: true,
      ...patch,
    }),
  );
  return app.request(path, {
    method: "POST",
    headers: { origin: "http://localhost:5173", "Idempotency-Key": key },
    body,
  });
}
it("links an approved photo to its issue without AI findings or a repeated location", async () => {
  expect((await request()).status).toBe(201);
  const row = state.writes.find((item) =>
    item.query.includes("INSERT INTO evidence"),
  )!;
  expect(row.values[1]).toBe(id);
  expect(row.values[3]).toContain("No AI assessment");
  expect(row.values[5]).toBeNull();
  expect(row.values[6]).toBeNull();
  expect(state.putImage).toHaveBeenCalledOnce();
  expect(
    state.writes.some((item) => item.query.includes("UPDATE issues")),
  ).toBe(false);
});
it.each([
  { imageApproved: false },
  { finalApproved: false },
  { observationDate: "2999-01-01" },
])(
  "rejects missing approval or an invalid observation date: %j",
  async (patch) => {
    expect((await request(patch)).status).toBe(400);
    expect(state.putImage).not.toHaveBeenCalled();
  },
);
it("requires a signed-in member and a public parent issue", async () => {
  state.allowed = false;
  expect((await request()).status).toBe(401);
  state.allowed = true;
  state.exists = false;
  expect((await request()).status).toBe(404);
  expect(state.putImage).not.toHaveBeenCalled();
});
it("reuses a successful submission and rejects a changed payload with the same key", async () => {
  const key = crypto.randomUUID();
  const first = await request({}, key);
  expect(first.status).toBe(201);
  const repeated = await request({}, key);
  expect(repeated.status).toBe(201);
  expect(await repeated.json()).toEqual(await first.json());
  expect(state.putImage).toHaveBeenCalledOnce();
  expect((await request({ note: "Changed note" }, key)).status).toBe(409);
});
it("does not allow the short evidence request to create a new issue", async () => {
  expect((await request({}, crypto.randomUUID(), "/api/issues")).status).toBe(
    400,
  );
  expect(state.putImage).not.toHaveBeenCalled();
});
