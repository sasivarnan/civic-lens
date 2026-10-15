import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { analysisSchema, type Analysis } from "@civiclens/shared";
import { config } from "./config.js";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const hash = (x: string | Buffer) =>
  createHash("sha256").update(x).digest("hex");
export const analyzedHash = (image: Buffer, description: string) =>
  hash(hash(image) + "\n" + description.trim());
export function signReceipt(
  userId: string,
  inputHash: string,
  analysis: Analysis,
  model: string,
  inputMaxEdge?: number,
) {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      inputHash,
      analysis,
      model,
      inputMaxEdge,
      issuedAt: Date.now(),
      expires: Date.now() + 30 * 60 * 1000,
    }),
  ).toString("base64url");
  return (
    payload +
    "." +
    createHmac("sha256", config.AUTH_SECRET).update(payload).digest("base64url")
  );
}
export function verifyReceipt(
  token: string,
  userId: string,
  inputHash: string,
) {
  try {
    const [body, signature, ...extra] = token.split(".");
    if (extra.length || !body || !signature) throw 0;
    const actual = Buffer.from(signature, "base64url"),
      expected = createHmac("sha256", config.AUTH_SECRET).update(body).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw 0;
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (
      data.userId !== userId ||
      data.inputHash !== inputHash ||
      typeof data.expires !== "number" ||
      data.expires < Date.now()
    )
      throw 0;
    return { ...data, analysis: analysisSchema.parse(data.analysis) } as {
      analysis: Analysis;
      model: string;
      inputMaxEdge?: number;
      issuedAt: number;
    };
  } catch {
    throw new HttpError(
      409,
      "The analysis expired or its inputs changed. Please run AI review again.",
    );
  }
}
