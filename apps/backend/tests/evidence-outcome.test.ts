import { afterEach, expect, it, vi } from "vitest";
import type { Context, Next } from "hono";
import sharp from "sharp";
const mocks = vi.hoisted(() => {
  const sql = Object.assign(
    vi.fn(async () => []),
    {
      begin: vi.fn(async (callback: (tx: unknown) => unknown) => callback(sql)),
    },
  );
  return { sql, putImage: vi.fn() };
});
vi.mock("../src/db.js", () => ({ sql: mocks.sql }));
vi.mock("../src/auth.js", () => ({
  authConfig: async (_c: Context, next: Next) => next(),
  authHandler: () => async () => new Response("Not used"),
  member: async () => ({ id: "outcome-member", role: "member" }),
  admin: async () => ({ id: "outcome-admin", role: "admin" }),
}));
vi.mock("../src/media.js", async (original) => ({
  ...(await original<typeof import("../src/media.js")>()),
  putImage: mocks.putImage,
}));
import { app } from "../src/app.js";
import { analyzedHash, signReceipt } from "../src/security.js";
const insufficient = {
  evidenceStatus: "insufficient" as const,
  category: null,
  observations: ["Image 1 is blank."],
  claims: [],
  conflicts: [],
  unknowns: ["No civic context is visible."],
  nextEvidence: "Select a relevant photo.",
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function image() {
  return sharp({
    create: { width: 40, height: 40, channels: 3, background: "white" },
  })
    .jpeg()
    .toBuffer();
}
it("returns a useful insufficient result without a publication receipt", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            message: { content: JSON.stringify(insufficient) },
          }),
        ),
    ),
  );
  const form = new FormData();
  form.set(
    "image",
    new File([await image()], "blank.jpg", { type: "image/jpeg" }),
  );
  form.set("description", "A synthetic blank image.");
  form.set("imageApproved", "true");
  const result = await app.request("/api/analyses", {
    method: "POST",
    headers: { Origin: "http://localhost:5173" },
    body: form,
  });
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({
    analysis: insufficient,
    receipt: "",
  });
  expect(mocks.putImage).not.toHaveBeenCalled();
});
it.each([
  "/api/issues",
  "/api/issues/8f102b20-6654-4b79-9de6-dc407f302001/evidence",
])(
  "blocks insufficient evidence at %s even with a valid signed receipt",
  async (path) => {
    const bytes = await image();
    const description = "A synthetic blank image.";
    const receipt = signReceipt(
      "outcome-member",
      analyzedHash(bytes, description),
      insufficient,
      "test-model",
    );
    const form = new FormData();
    form.set("image", new File([bytes], "blank.jpg", { type: "image/jpeg" }));
    form.set(
      "report",
      JSON.stringify({
        title: "Synthetic test report",
        description,
        category: "pothole",
        observationDate: "2026-10-15",
        location: {
          latitude: 12.9716,
          longitude: 77.5946,
          source: "coordinates",
          confirmed: true,
        },
        analyzedDescription: description,
        receipt,
        imageApproved: true,
        finalApproved: true,
      }),
    );
    const result = await app.request(path, {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: form,
    });
    expect(result.status).toBe(422);
    expect(await result.json()).toMatchObject({
      error: expect.stringContaining("Insufficient evidence"),
    });
    expect(mocks.putImage).not.toHaveBeenCalled();
    expect(mocks.sql.mock.calls).toHaveLength(2); // Lock and idempotency read only; no content writes.
  },
);
