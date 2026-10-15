import { existsSync } from "node:fs"
import { mkdir, cp, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
const require = createRequire(import.meta.url)
const vision = join(dirname(require.resolve("@mediapipe/tasks-vision")), "wasm")
const visionTarget = new URL("../public/vision/", import.meta.url)
await mkdir(visionTarget, { recursive: true })
await cp(vision, visionTarget, { recursive: true })
await mkdir(new URL("../public/models/", import.meta.url), { recursive: true })
const target = new URL("../public/models/face_detector.tflite", import.meta.url)
if (!existsSync(target)) {
  const r = await fetch(
    "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
  )
  if (!r.ok) throw new Error("Face model download failed.")
  await writeFile(target, Buffer.from(await r.arrayBuffer()))
}
console.log(
  "Local face model and WASM files are ready. Start services with docker compose up -d --build."
)
