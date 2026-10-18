import { afterEach, expect, it, vi } from "vitest"
import { drawPrivacyImage, type Cover } from "../src/lib/privacy-image"
const source = { width: 800, height: 600 } as ImageBitmap
const region: Cover = { x: 0.25, y: 0.25, w: 0.25, h: 0.25, effect: "blur" }
afterEach(() => vi.restoreAllMocks())
function setup(filter: string | undefined = "none") {
  const ctx = {
    filter,
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  }
  const reduced = { drawImage: vi.fn() }
  const canvas = document.createElement("canvas")
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      return (this === canvas
        ? ctx
        : reduced) as unknown as CanvasRenderingContext2D
    }
  )
  return { canvas, ctx, reduced }
}
it("removes fine detail and clips baked blur to an opaque region", () => {
  const { canvas, ctx, reduced } = setup()
  drawPrivacyImage(canvas, source, [region])
  expect(ctx.fillRect).toHaveBeenCalledWith(200, 150, 200, 150)
  expect(ctx.rect).toHaveBeenCalledWith(200, 150, 200, 150)
  expect(ctx.clip).toHaveBeenCalledOnce()
  expect(reduced.drawImage).toHaveBeenCalledWith(
    source,
    200,
    150,
    200,
    150,
    0,
    0,
    6,
    5
  )
  expect(ctx.drawImage).toHaveBeenCalledTimes(2)
  expect(ctx.filter).toBe("blur(38px)")
  expect(ctx.fillRect.mock.invocationCallOrder[0]).toBeLessThan(
    ctx.drawImage.mock.invocationCallOrder[1]
  )
  expect(ctx.restore).toHaveBeenCalledOnce()
})
it("keeps a solid cover when the browser has no filter support", () => {
  const { canvas, ctx, reduced } = setup()
  ctx.filter = undefined
  drawPrivacyImage(canvas, source, [region])
  expect(ctx.fillRect).toHaveBeenCalledWith(200, 150, 200, 150)
  expect(ctx.drawImage).toHaveBeenCalledTimes(1)
  expect(reduced.drawImage).not.toHaveBeenCalled()
})
it("restores a solid cover if filtered drawing fails", () => {
  const { canvas, ctx } = setup()
  ctx.drawImage
    .mockImplementationOnce(() => {})
    .mockImplementationOnce(() => {
      throw new Error("Filter failed")
    })
  drawPrivacyImage(canvas, source, [region])
  expect(ctx.fillRect).toHaveBeenCalledTimes(2)
  expect(ctx.restore).toHaveBeenCalledOnce()
})
it("draws solid regions last so overlapping blur cannot uncover them", () => {
  const { canvas, ctx } = setup()
  drawPrivacyImage(canvas, source, [{ ...region, effect: "solid" }, region])
  expect(ctx.fillRect).toHaveBeenCalledTimes(2)
  expect(ctx.fillRect.mock.invocationCallOrder[1]).toBeGreaterThan(
    ctx.drawImage.mock.invocationCallOrder[1]
  )
})
it("clips regions to the image bounds and skips empty regions", () => {
  const { canvas, ctx } = setup()
  drawPrivacyImage(canvas, source, [
    { x: 0.9, y: 0.9, w: 0.4, h: 0.4, effect: "solid" },
    { ...region, w: 0 },
  ])
  expect(ctx.fillRect).toHaveBeenCalledTimes(1)
  expect(ctx.fillRect).toHaveBeenCalledWith(720, 540, 80, 60)
})
