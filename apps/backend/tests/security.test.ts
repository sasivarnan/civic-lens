import { describe, it, expect, vi, afterEach } from "vitest";
import { signReceipt, verifyReceipt, analyzedHash } from "../src/security.js";
import { reportSchema, observationDateSchema, today } from "@civiclens/shared";
import { app } from "../src/app.js";
const analysis = {
  category: "pothole" as const,
  observations: ["Image 1: damaged surface."],
  claims: [],
  conflicts: [],
  unknowns: ["Depth is unknown."],
  nextEvidence: "Provide a wider view.",
};
afterEach(() => vi.useRealTimers());
describe("Evidence approval receipt", () => {
  it("accepts only the signed user and analyzed bytes/text", () => {
    const digest = analyzedHash(
      Buffer.from("approved"),
      "resident description",
    );
    const receipt = signReceipt("member-a", digest, analysis, "test-model");
    expect(verifyReceipt(receipt, "member-a", digest).analysis).toEqual(
      analysis,
    );
    expect(() => verifyReceipt(receipt, "member-b", digest)).toThrow();
    expect(() =>
      verifyReceipt(
        receipt,
        "member-a",
        analyzedHash(Buffer.from("changed"), "resident description"),
      ),
    ).toThrow();
  });
  it("rejects tampering and expired receipts", () => {
    vi.useFakeTimers();
    const receipt = signReceipt("a", "digest", analysis, "test-model");
    const [payload, signature] = receipt.split(".");
    const body = JSON.parse(Buffer.from(payload!, "base64url").toString());
    body.analysis.observations = ["Fabricated finding"];
    expect(() =>
      verifyReceipt(
        Buffer.from(JSON.stringify(body)).toString("base64url") +
          "." +
          signature,
        "a",
        "digest",
      ),
    ).toThrow();
    vi.advanceTimersByTime(31 * 60 * 1000);
    expect(() => verifyReceipt(receipt, "a", "digest")).toThrow();
  });
});
it("requires image, location, and final approvals", () => {
  expect(reportSchema.safeParse({}).success).toBe(false);
});
it("rejects cross-origin writes before authentication or database access", async () => {
  const r = await app.request("/api/issues", {
    method: "POST",
    headers: {
      origin: "https://attacker.example",
      "content-type": "application/json",
    },
    body: "{}",
  });
  expect(r.status).toBe(403);
});
it("requires authentication for final submission", async () => {
  const r = await app.request("/api/issues", {
    method: "POST",
    headers: {
      origin: "http://localhost:5173",
      "content-type": "application/json",
    },
    body: "{}",
  });
  expect(r.status).toBe(401);
});
it("does not fall through unknown API routes to frontend HTML", async () => {
  const r = await app.request("/api/unknown");
  expect(r.status).toBe(404);
  expect(r.headers.get("content-type")).toContain("application/json");
});

it("rejects dates that roll over to a different calendar day", () => {
  expect(observationDateSchema.safeParse("2026-02-31").success).toBe(false);
  expect(observationDateSchema.safeParse("2026-02-28").success).toBe(true);
});
it("uses the Bengaluru calendar date at the UTC day boundary", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T20:00:00Z"));
  expect(today()).toBe("2026-10-15");
  expect(observationDateSchema.safeParse("2026-10-15").success).toBe(true);
  expect(observationDateSchema.safeParse("2026-10-16").success).toBe(false);
});
