import sharp from "sharp";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { config, maxImageBytes } from "./config.js";
import { HttpError } from "./security.js";
const storage = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_KEY,
  },
});
export async function readImage(file: unknown) {
  if (!(file instanceof File) || file.size === 0 || file.size > maxImageBytes)
    throw new HttpError(400, "Choose an approved image smaller than 8 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const meta = await sharp(bytes, {
      limitInputPixels: 20_000_000,
    }).metadata();
    if (
      !["jpeg", "png", "webp"].includes(meta.format ?? "") ||
      (meta.pages && meta.pages > 1)
    )
      throw 0;
    return bytes;
  } catch {
    throw new HttpError(
      400,
      "Use a still JPEG, PNG, or WebP image under 20 megapixels.",
    );
  }
}
export async function prepareImage(bytes: Buffer) {
  return sharp(bytes, { limitInputPixels: 20_000_000 })
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 86 })
    .toBuffer();
}
export async function putImage(key: string, bytes: Buffer) {
  const clean = await prepareImage(bytes);
  await storage.send(
    new PutObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: key,
      Body: clean,
      ContentType: "image/jpeg",
    }),
    { abortSignal: AbortSignal.timeout(15000) },
  );
  return clean.length;
}
export async function getImage(key: string) {
  const r = await storage.send(
    new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
    { abortSignal: AbortSignal.timeout(15000) },
  );
  if (!r.Body) throw new HttpError(404, "Image not found.");
  return r.Body.transformToByteArray();
}
export async function deleteImage(key: string) {
  await storage.send(
    new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
    { abortSignal: AbortSignal.timeout(15000) },
  );
}
