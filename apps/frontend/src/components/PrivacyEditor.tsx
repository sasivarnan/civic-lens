import { useEffect, useRef, useState } from "react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { createPrivacyApproval, StalePhotoError } from "../lib/privacy"
export type Cover = { x: number; y: number; w: number; h: number }
export function PrivacyEditor({
  file,
  onEdit,
  onApprove,
}: {
  file: File
  onEdit: () => void
  onApprove: (file: File) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    bitmap = useRef<ImageBitmap | null>(null),
    [covers, setCovers] = useState<Cover[]>([]),
    [message, setMessage] = useState(
      "Add covers for faces, plates, and private details."
    ),
    [ready, setReady] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [preview, setPreview] = useState<string | null>(null)
  const [approval] = useState(createPrivacyApproval)
  const [exporting, setExporting] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const alive = useRef(true)
  const drag = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    let live = true
    alive.current = true
    void createImageBitmap(file, { imageOrientation: "from-image" })
      .then((b) => {
        if (!live) {
          b.close()
          return
        }
        if (b.width * b.height > 20_000_000) {
          b.close()
          setMessage("Use an image under 20 megapixels.")
          return
        }
        bitmap.current = b
        setReady(true)
      })
      .catch(() => {
        if (live) setMessage("Cannot open this image. Select another photo.")
      })
    return () => {
      live = false
      alive.current = false
      approval.change()
      bitmap.current?.close()
      bitmap.current = null
    }
  }, [file, approval])
  useEffect(() => {
    const c = canvas.current,
      b = bitmap.current
    if (!c || !b || !ready) return
    const scale = Math.min(1, 1600 / Math.max(b.width, b.height))
    c.width = Math.round(b.width * scale)
    c.height = Math.round(b.height * scale)
    const ctx = c.getContext("2d")!
    ctx.drawImage(b, 0, 0, c.width, c.height)
    ctx.fillStyle = "#111111"
    for (const r of covers)
      ctx.fillRect(r.x * c.width, r.y * c.height, r.w * c.width, r.h * c.height)
  }, [covers, ready])
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview]
  )
  function invalidate() {
    approval.change()
    setReviewed(false)
    setPreview(null)
    onEdit()
  }
  function edit(next: Cover[]) {
    invalidate()
    setCovers(next)
  }
  async function suggest() {
    if (!bitmap.current || detecting) return
    invalidate()
    const version = approval.version()
    const source = bitmap.current
    setDetecting(true)
    setMessage("Checking for faces on this device…")
    try {
      const { FaceDetector, FilesetResolver } =
        await import("@mediapipe/tasks-vision")
      const detector = await FaceDetector.createFromOptions(
        await FilesetResolver.forVisionTasks("/vision"),
        {
          baseOptions: {
            modelAssetPath: "/models/face_detector.tflite",
            delegate: "CPU",
          },
          runningMode: "IMAGE",
          minDetectionConfidence: 0.35,
        }
      )
      try {
        const b = bitmap.current
        if (!alive.current || b !== source || !approval.isCurrent(version))
          return
        const suggested = detector.detect(b).detections.flatMap((d) =>
          d.boundingBox
            ? [
                {
                  x: Math.max(0, d.boundingBox.originX / b.width - 0.025),
                  y: Math.max(0, d.boundingBox.originY / b.height - 0.025),
                  w: Math.min(1, d.boundingBox.width / b.width + 0.05),
                  h: Math.min(1, d.boundingBox.height / b.height + 0.05),
                },
              ]
            : []
        )
        edit([...covers, ...suggested])
        setMessage(
          suggested.length
            ? "Suggested covers added. Check every cover."
            : "No faces detected. Check the entire image manually."
        )
      } finally {
        detector.close()
      }
    } catch {
      if (alive.current && approval.isCurrent(version))
        setMessage(
          "Face suggestions are unavailable. Add manual covers and review the image."
        )
    } finally {
      if (alive.current) setDetecting(false)
    }
  }

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    }
  }
  async function exportImage() {
    const c = canvas.current
    if (!c || !ready || !reviewed || exporting || detecting) return
    setExporting(true)
    setPreview(null)
    onEdit()
    const version = approval.version() + 1
    try {
      const result = await approval.export(
        () =>
          new Promise<Blob | null>((resolve) =>
            c.toBlob(resolve, "image/jpeg", 0.9)
          )
      )
      if (!alive.current || !approval.isCurrent(result.version)) return
      const url = URL.createObjectURL(result.blob)
      setPreview(url)
      onApprove(
        new File([result.blob], crypto.randomUUID() + ".jpg", {
          type: "image/jpeg",
        })
      )
      setMessage("This is the exact image that will be sent.")
    } catch (error) {
      if (
        alive.current &&
        !(error instanceof StalePhotoError) &&
        approval.isCurrent(version)
      ) {
        invalidate()
        setMessage(
          "Image export failed. Upload is blocked. Review the image and try again."
        )
      }
    } finally {
      if (alive.current) setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        The original stays on this device. Draw solid covers, or use the
        coordinate controls below.
      </p>
      <canvas
        ref={canvas}
        className="privacy-canvas"
        aria-label="Photo privacy editor"
        onPointerDown={(e) => {
          drag.current = point(e)
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerUp={(e) => {
          const start = drag.current,
            end = point(e)
          drag.current = null
          if (
            start &&
            Math.abs(start.x - end.x) > 0.005 &&
            Math.abs(start.y - end.y) > 0.005
          )
            edit([
              ...covers,
              {
                x: Math.min(start.x, end.x),
                y: Math.min(start.y, end.y),
                w: Math.abs(end.x - start.x),
                h: Math.abs(end.y - start.y),
              },
            ])
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!ready || detecting || exporting}
          onClick={() => void suggest()}
        >
          Suggest face covers
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!ready}
          onClick={() =>
            edit([...covers, { x: 0.35, y: 0.35, w: 0.2, h: 0.2 }])
          }
        >
          Add manual cover
        </Button>
      </div>
      {covers.map((r, i) => (
        <fieldset className="cover-controls" key={i}>
          <legend>Cover {i + 1}</legend>
          {(["x", "y", "w", "h"] as const).map((k) => (
            <Label key={k}>
              {{ x: "Left", y: "Top", w: "Width", h: "Height" }[k]} %
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                value={Math.round(r[k] * 100)}
                onChange={(e) => {
                  const n = Math.max(
                    0,
                    Math.min(1, Number(e.target.value) / 100)
                  )
                  edit(covers.map((x, j) => (j === i ? { ...x, [k]: n } : x)))
                }}
              />
            </Label>
          ))}
          <Button
            variant="ghost"
            type="button"
            onClick={() => edit(covers.filter((_, j) => j !== i))}
          >
            Remove
          </Button>
        </fieldset>
      ))}
      <p role="status" className="text-sm">
        {message}
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(e) => {
            approval.review(e.target.checked)
            setReviewed(e.target.checked)
            setPreview(null)
            onEdit()
          }}
        />
        I checked the whole image for faces, plates, addresses, and other
        private details.
      </label>
      <Button
        type="button"
        disabled={!ready || !reviewed || exporting || detecting}
        onClick={() => void exportImage()}
      >
        Create approved upload image
      </Button>
      {preview && (
        <div className="approved-preview">
          <p className="eyebrow">Approved upload copy</p>
          <img src={preview} alt="Exact privacy-edited upload copy" />
        </div>
      )}
    </div>
  )
}
