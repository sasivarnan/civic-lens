import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareImage, readImage } from "../src/media.js";
const file = (bytes: Buffer, type = "image/jpeg") =>
  new File([bytes], "fixture.jpg", { type });
describe("server image privacy boundary", () => {
  it("removes source EXIF, orientation, and embedded metadata before AI or storage", async () => {
    const source = await sharp({
      create: { width: 800, height: 400, channels: 3, background: "white" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExifMerge({ IFD0: { Artist: "CIVICLENS SYNTHETIC PRIVATE MARKER" } })
      .toBuffer();
    expect((await sharp(source).metadata()).exif).toBeDefined();
    const output = await prepareImage(await readImage(file(source)));
    const meta = await sharp(output).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect([meta.width, meta.height]).toEqual([400, 800]);
    expect(
      output.includes(Buffer.from("CIVICLENS SYNTHETIC PRIVATE MARKER")),
    ).toBe(false);
  });
  it("preserves solid covers through server re-encoding", async () => {
    const source = await sharp({
      create: { width: 400, height: 400, channels: 3, background: "white" },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="400" height="400"><rect x="100" y="100" width="200" height="200" fill="#111111"/></svg>',
          ),
        },
      ])
      .jpeg()
      .toBuffer();
    const output = await prepareImage(source);
    const { data } = await sharp(output)
      .extract({ left: 150, top: 150, width: 100, height: 100 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(Math.max(...data)).toBeLessThan(25);
  });
  it("rejects corrupt files and SVG input", async () => {
    await expect(readImage(file(Buffer.from("not a jpeg")))).rejects.toThrow(
      "still JPEG",
    );
    await expect(
      readImage(
        file(Buffer.from('<svg width="1" height="1"></svg>'), "image/svg+xml"),
      ),
    ).rejects.toThrow("still JPEG");
  });
  it("rejects oversized files and images over the pixel limit", async () => {
    await expect(
      readImage(file(Buffer.alloc(8 * 1024 * 1024 + 1))),
    ).rejects.toThrow("smaller than 8 MB");
    const large = await sharp({
      create: { width: 4500, height: 4500, channels: 3, background: "white" },
    })
      .jpeg()
      .toBuffer();
    await expect(readImage(file(large))).rejects.toThrow("under 20 megapixels");
  });
});
