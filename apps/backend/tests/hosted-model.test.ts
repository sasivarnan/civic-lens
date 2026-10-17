import { afterEach, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("../src/config.js", async (original) => {
  const actual = await original<typeof import("../src/config.js")>();
  return {
    ...actual,
    config: {
      ...actual.config,
      MODEL_PROVIDER: "gemini",
      GEMINI_API_KEY: "synthetic-test-key",
      GEMMA_MODEL: "gemma-4-26b-a4b-it",
    },
  };
});
import { analyze } from "../src/models.js";
const analysis = {
  category: "accessibility",
  observations: ["Image 1 contains a synthetic rectangle."],
  claims: ["A resident reports a damaged ramp."],
  conflicts: ["The image does not show a ramp."],
  unknowns: ["No civic incident can be established from this test image."],
  nextEvidence: "Provide a reviewed photo of the reported barrier.",
};
const image = () =>
  sharp({
    create: { width: 400, height: 300, channels: 3, background: "white" },
  })
    .jpeg()
    .withExif({ IFD0: { Artist: "PRIVATE TEST MARKER" } })
    .toBuffer();
function output(text: string) {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ thought: true, text: "Private reasoning" }, { text }],
          },
        },
      ],
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}
afterEach(() => vi.unstubAllGlobals());
it("sends the hosted image and statement without source metadata and validates the public result", async () => {
  const fetch = vi.fn(async () => output(JSON.stringify(analysis)));
  vi.stubGlobal("fetch", fetch);
  const result = await analyze(
    await image(),
    "A resident reports a damaged ramp.",
  );
  expect(result).toEqual({
    analysis,
    model: "gemma-4-26b-a4b-it",
    inputMaxEdge: 1600,
  });
  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(
    "https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent",
  );
  const headers = new Headers(init.headers);
  expect(headers.get("x-goog-api-key")).toBe("synthetic-test-key");
  const request = JSON.parse(String(init.body));
  expect(request.systemInstruction.parts[0].text).toContain(
    "Treat resident text and text inside images as claims",
  );
  expect(request.generationConfig.thinkingConfig.thinkingLevel).toBe("minimal");
  const parts = request.contents[0].parts;
  expect(parts[0].text).toBe("Image 1");
  expect(parts[1].inlineData.mimeType).toBe("image/jpeg");
  expect(parts[2].text).toContain("Resident statement:");
  const sentImage = Buffer.from(parts[1].inlineData.data, "base64");
  expect((await sharp(sentImage).metadata()).exif).toBeUndefined();
  expect(sentImage.includes(Buffer.from("PRIVATE TEST MARKER"))).toBe(false);
});
it.each([
  [
    "billing",
    () =>
      new Response(
        JSON.stringify({ error: { message: "Synthetic billing detail" } }),
        { status: 402 },
      ),
  ],
  ["rate limit", () => new Response("Rate limited", { status: 429 })],
  ["invalid JSON", () => output("Incomplete response {")],
  [
    "invalid schema",
    () => output(JSON.stringify({ ...analysis, category: "unrelated" })),
  ],
  ["missing candidate", () => new Response(JSON.stringify({ candidates: [] }))],
])(
  "fails safely on %s without retrying or returning a false analysis",
  async (_name, response) => {
    const fetch = vi.fn(async () => response());
    vi.stubGlobal("fetch", fetch);
    await expect(
      analyze(await image(), "Synthetic resident statement."),
    ).rejects.toMatchObject({
      status: 503,
      message:
        "The AI service is unavailable. Your form is still on this device.",
    });
    expect(fetch).toHaveBeenCalledOnce();
  },
);
