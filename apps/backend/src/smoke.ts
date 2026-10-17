import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import sharp from "sharp";
import { config } from "./config.js";
const base = "http://localhost:3000",
  origin = "http://localhost:5173";
class Client {
  cookies = new Map<string, string>();
  async call(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Origin", origin);
    headers.set(
      "Cookie",
      [...this.cookies].map(([k, v]) => k + "=" + v).join("; "),
    );
    const r = await fetch(base + path, {
      ...init,
      headers,
      redirect: "manual",
    });
    for (const cookie of r.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const split = pair!.indexOf("=");
      this.cookies.set(pair!.slice(0, split), pair!.slice(split + 1));
    }
    return r;
  }
}
async function login(email: string) {
  const client = new Client();
  const csrf = (await (await client.call("/api/auth/csrf")).json()) as any;
  const r = await client.call("/api/auth/signin/nodemailer", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
    },
    body: new URLSearchParams({
      email,
      csrfToken: csrf.csrfToken,
      callbackUrl: origin,
    }),
  });
  assert.equal(r.status, 200, "Sign-in request failed");
  let message: any;
  for (let n = 0; n < 15; n++) {
    const list = (await (
      await fetch("http://localhost:8025/api/v1/messages")
    ).json()) as any;
    const found = list.messages?.find((x: any) =>
      x.To?.some((t: any) => t.Address === email),
    );
    if (found) {
      message = await (
        await fetch("http://localhost:8025/api/v1/message/" + found.ID)
      ).json();
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(message, "No local sign-in email");
  const link = String(message.Text).match(
    /https?:\/\/[^\s<>]+\/api\/auth\/callback\/nodemailer\?[^\s<>]+/,
  )?.[0];
  assert.ok(link, "No verification link in email");
  const url = new URL(link);
  const callback = await client.call(url.pathname + url.search);
  assert.equal(callback.status, 302);
  const session = (await (
    await client.call("/api/auth/session")
  ).json()) as any;
  assert.ok(session.user?.id, "No database session");
  return client;
}
const reporter = await login("reporter@civiclens.test");
console.log("PASS real email-link authentication");
const image = process.env.TEST_IMAGE;
assert.ok(image, "Set TEST_IMAGE to a non-sensitive JPEG fixture.");
const blank = await sharp({
  create: { width: 40, height: 40, channels: 3, background: "white" },
})
  .jpeg()
  .toBuffer();
const insufficientForm = new FormData();
insufficientForm.set(
  "image",
  new File([blank], "blank.jpg", { type: "image/jpeg" }),
);
insufficientForm.set(
  "description",
  "A resident claims a pothole. Assess only the visible image.",
);
insufficientForm.set("imageApproved", "true");
const insufficientResponse = await reporter.call("/api/analyses", {
  method: "POST",
  body: insufficientForm,
});
assert.equal(
  insufficientResponse.status,
  200,
  await insufficientResponse.clone().text(),
);
const insufficientResult = (await insufficientResponse.json()) as any;
assert.equal(insufficientResult.analysis.evidenceStatus, "insufficient");
assert.equal(insufficientResult.analysis.category, null);
assert.equal(insufficientResult.receipt, "");
console.log("PASS blank image has no category or publication receipt");
const bytes = await readFile(image);
const description =
  "Disposable test using a reference photo. This is not a current local incident. Describe only visible road damage and state uncertainty.";
const form = new FormData();
form.set("image", new File([bytes], "approved.jpg", { type: "image/jpeg" }));
form.set("description", description);
form.set("imageApproved", "true");
const review = await reporter.call("/api/analyses", {
  method: "POST",
  body: form,
});
assert.equal(review.status, 200, await review.clone().text());
const result = (await review.json()) as any;
assert.equal(
  result.analysis.evidenceStatus,
  "sufficient",
  "Select a relevant reference photo for the publication smoke test.",
);
assert.ok(result.receipt);
const reviewedModel = JSON.parse(
  Buffer.from(result.receipt.split(".")[0], "base64url").toString(),
).model;
assert.equal(
  reviewedModel,
  config.MODEL_PROVIDER === "gemini"
    ? config.GEMMA_MODEL
    : config.OLLAMA_GEMMA_MODEL,
  "The backend must use the configured model after a provider change",
);
console.log(`PASS live ${reviewedModel} analysis and signed receipt`);
const report = {
  title: "Demo smoke test: reviewed road damage",
  description,
  category: result.analysis.category,
  observationDate: new Date().toISOString().slice(0, 10),
  location: {
    latitude: 12.9716,
    longitude: 77.5946,
    source: "coordinates",
    confirmed: true,
  },
  analyzedDescription: description,
  receipt: result.receipt,
  imageApproved: true,
  finalApproved: true,
};
const key = crypto.randomUUID();
function submission() {
  const form = new FormData();
  form.set("image", new File([bytes], "approved.jpg", { type: "image/jpeg" }));
  form.set("report", JSON.stringify(report));
  return form;
}
const publish = await reporter.call("/api/issues", {
  method: "POST",
  headers: { "Idempotency-Key": key },
  body: submission(),
});
assert.equal(publish.status, 201, await publish.clone().text());
const issue = (await publish.json()) as any;
const again = await reporter.call("/api/issues", {
  method: "POST",
  headers: { "Idempotency-Key": key },
  body: submission(),
});
assert.equal(((await again.json()) as any).id, issue.id);
console.log("PASS publication, private S3 storage, and idempotent retry");
const detail = (await (
  await reporter.call("/api/issues/" + issue.id)
).json()) as any;
assert.ok(detail.assetId);
assert.equal(detail.analysis.category, result.analysis.category);
assert.ok(!("author_id" in detail));
const asset = await reporter.call("/api/assets/" + detail.assetId);
assert.equal(asset.status, 200);
assert.equal(asset.headers.get("cache-control"), "private, no-store");
console.log("PASS public detail and controlled image access");
const evidenceResponse = await reporter.call(
  "/api/issues/" + issue.id + "/evidence",
  {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: submission(),
  },
);
assert.equal(
  evidenceResponse.status,
  201,
  await evidenceResponse.clone().text(),
);
const withHistory = (await (
  await reporter.call("/api/issues/" + issue.id)
).json()) as any;
assert.ok(withHistory.history.some((h: any) => h.kind === "evidence"));
console.log("PASS later evidence and issue history");
const { runVectorJob } = await import("./jobs.js");
let matched = false;
for (let attempt = 0; attempt < 3 && !matched; attempt++) {
  await runVectorJob();
  const search = await reporter.call("/api/related-reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      description: "damaged road surface",
      location: report.location,
    }),
  });
  assert.equal(search.status, 200, await search.clone().text());
  matched = ((await search.json()) as any).issues.some(
    (i: any) => i.id === issue.id,
  );
}
assert.ok(matched, "Published issue was not found after vector indexing");
console.log(
  "PASS live EmbeddingGemma indexing and location-filtered retrieval",
);
const member = await login("community@civiclens.test");
let react = await member.call("/api/issues/" + issue.id + "/reactions", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ support: true, confirmationDate: null, revision: 0 }),
});
assert.equal(react.status, 200);
let publicDetail = (await (
  await member.call("/api/issues/" + issue.id)
).json()) as any;
assert.equal(publicDetail.supportCount, 1);
assert.equal(publicDetail.confirmationCount, 0);
react = await member.call("/api/issues/" + issue.id + "/reactions", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    support: true,
    confirmationDate: report.observationDate,
    revision: 1,
  }),
});
assert.equal(react.status, 200);
publicDetail = await (await member.call("/api/issues/" + issue.id)).json();
assert.equal(publicDetail.supportCount, 1);
assert.equal(publicDetail.confirmationCount, 1);
console.log("PASS separate support and dated observation");
assert.equal((await member.call("/api/moderation/flags")).status, 403);
const admin = await login("admin@civiclens.test");
assert.equal((await admin.call("/api/moderation/flags")).status, 200);
const hidden = await admin.call("/api/moderation/content/issue/" + issue.id, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    visibility: "hidden",
    reason: "Hide disposable smoke-test evidence after verification.",
  }),
});
assert.equal(hidden.status, 200);
assert.equal((await reporter.call("/api/issues/" + issue.id)).status, 404);
assert.equal(
  (await reporter.call("/api/assets/" + detail.assetId)).status,
  404,
);
console.log("PASS admin access and hidden asset revocation");
console.log("SMOKE COMPLETE: test issue hidden; demo data remains.");
