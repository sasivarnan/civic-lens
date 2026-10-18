import { beforeEach, expect, it, vi } from "vitest";
import type { Context, Next } from "hono";
const state = vi.hoisted(() => ({
  stage: "not_assigned",
  revision: 0,
  status: "reported",
  exists: true,
  evidence: true,
  allowed: true,
  writes: [] as string[],
}));
vi.mock("../src/auth.js", async (original) => ({
  ...(await original<typeof import("../src/auth.js")>()),
  authConfig: async (_c: Context, next: Next) => next(),
  admin: async () => {
    if (!state.allowed) {
      const { HttpError } = await import("../src/security.js");
      throw new HttpError(403, "Admin access is required.");
    }
    return { id: "admin-test" };
  },
}));
vi.mock("../src/db.js", () => {
  const sql = Object.assign(
    async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      if (query.includes("SELECT id,status,case_progress"))
        return state.exists
          ? [
              {
                id: "test",
                status: state.status,
                case_revision: state.revision,
                case_progress:
                  state.stage === "not_assigned"
                    ? null
                    : { stage: state.stage },
              },
            ]
          : [];
      if (query.includes("SELECT e.id FROM evidence"))
        return state.evidence ? [{ id: "evidence" }] : [];
      state.writes.push(query);
      return [];
    },
    {
      begin: async (callback: (tx: unknown) => unknown) => callback(sql),
      json: (value: unknown) => value,
    },
  );
  return { sql, db: {} };
});
import { app } from "../src/app.js";
import { caseProgressSchema } from "@civiclens/shared";
const id = "8f102b20-6654-4b79-9de6-dc407f302001";
const evidenceId = "8f102b20-6654-4b79-9de6-dc407f302002";
const input = {
  stage: "assigned",
  authority: "Demo authority",
  owner: "Demo coordinator",
  sourceUrl: "https://example.com/source",
  reference: "",
  sentDate: "",
  note: "Demo only: responsibility needs confirmation.",
  revision: 0,
};
beforeEach(() =>
  Object.assign(state, {
    stage: "not_assigned",
    revision: 0,
    status: "reported",
    exists: true,
    evidence: true,
    allowed: true,
    writes: [],
  }),
);
async function update(values = {}, origin = "http://localhost:5173") {
  return app.request(`/api/issues/${id}/progress`, {
    method: "PATCH",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ ...input, ...values }),
  });
}
it("restricts progress updates to admins", async () => {
  state.allowed = false;
  expect((await update()).status).toBe(403);
  expect(state.writes).toHaveLength(0);
});
it("rejects cross-origin updates before writes", async () => {
  expect((await update({}, "https://other.example")).status).toBe(403);
  expect(state.writes).toHaveLength(0);
});
it("saves assignment with an audit event and returns the next revision", async () => {
  const result = await update();
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ ok: true, revision: 1 });
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1]).toContain("INSERT INTO events");
});
it("rejects stale updates and unavailable stage transitions", async () => {
  state.revision = 1;
  expect((await update()).status).toBe(409);
  state.revision = 0;
  expect(
    (
      await update({
        stage: "in_progress",
        reference: "DEMO-1",
        sentDate: "2026-10-18",
      })
    ).status,
  ).toBe(409);
  expect(state.writes).toHaveLength(0);
});
it("requires a reference and date for a handoff", async () => {
  state.stage = "assigned";
  expect((await update({ stage: "sent" })).status).toBe(400);
  expect(state.writes).toHaveLength(0);
});
it.each(["resolution_reported", "closed", "reopened"])(
  "requires linked public later evidence for %s",
  async (stage) => {
    state.stage =
      stage === "resolution_reported" ? "assigned" : "resolution_reported";
    expect((await update({ stage })).status).toBe(400);
    state.evidence = false;
    expect((await update({ stage, evidenceId })).status).toBe(400);
    expect(state.writes).toHaveLength(0);
    state.evidence = true;
    expect((await update({ stage, evidenceId })).status).toBe(200);
  },
);
it("rejects hidden or missing issues", async () => {
  state.exists = false;
  expect((await update()).status).toBe(404);
});
it("rejects unsafe source links, missing ownership, and future handoff dates", () => {
  for (const fields of [
    { sourceUrl: "javascript:alert(1)" },
    { sourceUrl: "invalid" },
    { owner: "" },
    { authority: "" },
    { sentDate: "2999-01-01" },
  ])
    expect(caseProgressSchema.safeParse({ ...input, ...fields }).success).toBe(
      false,
    );
});
