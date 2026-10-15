import { afterEach, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("../src/auth.js", async (original) => ({
  ...(await original<typeof import("../src/auth.js")>()),
  member: async () => ({
    id: "privacy-test-member",
    name: "Test",
    role: "member",
  }),
}));
import { app } from "../src/app.js";
afterEach(() => vi.unstubAllGlobals());
it("strips source metadata before an approved request reaches the AI provider", async () => {
  const source = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: "white" },
  })
    .jpeg()
    .withExif({ IFD0: { Artist: "PRIVATE TEST MARKER" } })
    .toBuffer();
  expect((await sharp(source).metadata()).exif).toBeDefined();
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              category: "accessibility",
              observations: [],
              claims: [],
              conflicts: [],
              unknowns: ["Synthetic test"],
              nextEvidence: "Review manually.",
            }),
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const form = new FormData();
  form.set(
    "image",
    new File([source], "untrusted-client.jpg", { type: "image/jpeg" }),
  );
  form.set("imageApproved", "true");
  form.set("description", "Synthetic privacy test; no real incident.");
  const response = await app.request("/api/analyses", {
    method: "POST",
    headers: { Origin: "http://localhost:5173" },
    body: form,
  });
  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledOnce();
  const [, request] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  const sent = JSON.parse(String(request.body));
  const image = Buffer.from(sent.messages[1].images[0], "base64");
  const metadata = await sharp(image).metadata();
  expect(metadata.exif).toBeUndefined();
  expect(Math.max(metadata.width!, metadata.height!)).toBeLessThanOrEqual(512);
  expect(image.includes(Buffer.from("PRIVATE TEST MARKER"))).toBe(false);
});
