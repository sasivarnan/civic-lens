export type Cover = {
  x: number
  y: number
  w: number
  h: number
  effect: "blur" | "solid"
}

// Preview and JPEG export use the same canvas pixels. Never use a CSS filter.
export function drawPrivacyImage(
  canvas: HTMLCanvasElement,
  source: ImageBitmap,
  covers: Cover[]
) {
  const scale = Math.min(1, 1600 / Math.max(source.width, source.height))
  canvas.width = Math.round(source.width * scale)
  canvas.height = Math.round(source.height * scale)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Image editing is unavailable.")
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  // Solid covers have priority where regions overlap.
  const ordered = [
    ...covers.filter((r) => r.effect === "blur"),
    ...covers.filter((r) => r.effect === "solid"),
  ]
  for (const region of ordered) {
    const x = Math.floor(region.x * canvas.width)
    const y = Math.floor(region.y * canvas.height)
    const w =
      Math.min(canvas.width, Math.ceil((region.x + region.w) * canvas.width)) -
      x
    const h =
      Math.min(
        canvas.height,
        Math.ceil((region.y + region.h) * canvas.height)
      ) - y
    if (w <= 0 || h <= 0) continue
    // An opaque base prevents filtered edges from exposing original pixels.
    ctx.fillStyle = "#111111"
    ctx.fillRect(x, y, w, h)
    if (region.effect !== "blur" || typeof ctx.filter !== "string") continue
    ctx.save()
    let failed = false
    try {
      const radius = Math.max(8, Math.ceil(Math.min(w, h) * 0.25))
      const filter = `blur(${radius}px)`
      ctx.filter = filter
      if (ctx.filter !== filter) continue
      // Remove fine detail before blur. This is not a guarantee of anonymity.
      const tiny = document.createElement("canvas")
      tiny.width = Math.max(1, Math.round((6 * w) / Math.max(w, h)))
      tiny.height = Math.max(1, Math.round((6 * h) / Math.max(w, h)))
      const reduced = tiny.getContext("2d")
      if (!reduced) continue
      reduced.drawImage(
        source,
        (x * source.width) / canvas.width,
        (y * source.height) / canvas.height,
        (w * source.width) / canvas.width,
        (h * source.height) / canvas.height,
        0,
        0,
        tiny.width,
        tiny.height
      )
      ctx.beginPath()
      ctx.rect(x, y, w, h)
      ctx.clip()
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      // Extend the coarse patch so the blur does not fade into the source.
      const pad = radius * 3
      ctx.drawImage(tiny, x - pad, y - pad, w + pad * 2, h + pad * 2)
    } catch {
      failed = true
    } finally {
      ctx.restore()
    }
    if (failed) {
      ctx.fillStyle = "#111111"
      ctx.fillRect(x, y, w, h)
    }
  }
}
