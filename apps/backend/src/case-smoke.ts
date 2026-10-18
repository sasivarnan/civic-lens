import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { config } from "./config.js";
import { sql, authSql } from "./db.js";
import { putImage } from "./media.js";
import type { CaseStage } from "@civiclens/shared";
if (
  config.NODE_ENV === "production" ||
  !config.DEMO_MODE ||
  new URL(config.APP_ORIGIN).hostname !== "localhost" ||
  !["localhost", "127.0.0.1"].includes(new URL(config.DATABASE_URL).hostname) ||
  !["localhost", "127.0.0.1"].includes(new URL(config.S3_ENDPOINT).hostname)
)
  throw new Error("Case smoke checks require a local development environment.");
const base = "http://localhost:" + config.PORT;
class Client {
  cookies = new Map<string, string>();
  async call(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("origin", config.APP_ORIGIN);
    headers.set(
      "cookie",
      [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; "),
    );
    const response = await fetch(base + "/api" + path, {
      ...init,
      headers,
      redirect: "manual",
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0]!;
      const split = pair.indexOf("=");
      this.cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    return response;
  }
}
const admin = new Client();
const before = (await (
  await fetch("http://localhost:8025/api/v1/messages")
).json()) as any;
const seen = new Set(before.messages?.map((message: any) => message.ID));
const csrf = (await (await admin.call("/auth/csrf")).json()) as any;
assert.equal(
  (
    await admin.call("/auth/signin/nodemailer", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "X-Auth-Return-Redirect": "1",
      },
      body: new URLSearchParams({
        csrfToken: csrf.csrfToken,
        email: "admin@civiclens.test",
        callbackUrl: config.APP_ORIGIN,
      }),
    })
  ).status,
  200,
);
let link = "";
for (let attempt = 0; attempt < 20 && !link; attempt++) {
  const list = (await (
    await fetch("http://localhost:8025/api/v1/messages")
  ).json()) as any;
  const message = list.messages?.find(
    (item: any) =>
      !seen.has(item.ID) &&
      item.To?.some((target: any) => target.Address === "admin@civiclens.test"),
  );
  if (message) {
    const detail = (await (
      await fetch("http://localhost:8025/api/v1/message/" + message.ID)
    ).json()) as any;
    link =
      String(detail.Text).match(
        /https?:\/\/[^\s<>]+\/api\/auth\/callback\/nodemailer\?[^\s<>]+/,
      )?.[0] ?? "";
  }
  if (!link) await new Promise((resolve) => setTimeout(resolve, 200));
}
assert(link, "No new admin email link in Mailpit.");
const callback = new URL(link);
assert.equal(
  (await admin.call(callback.pathname.replace("/api", "") + callback.search))
    .status,
  302,
);
const session = (await (await admin.call("/auth/session")).json()) as any;
assert.equal(session.user.role, "admin");
console.log("PASS real admin email-link sign-in");
const member = new Client();
assert.equal(
  (await member.call("/demo-session", { method: "POST" })).status,
  200,
);
const id = randomUUID();
const evidenceIds = [randomUUID(), randomUUID()];
const queueFixtures: string[] = [];
try {
  // Local database fixtures have no model output and make no AI-review claim.
  await sql`INSERT INTO issues(id,author_id,title,description,category,latitude,longitude,point,location_source,observation_date,demo) VALUES(${id},${session.user.id},'Demo: case workflow check','Synthetic fixture for case workflow checks. No real incident or AI review is claimed.','pothole',12.97,77.59,ST_SetSRID(ST_MakePoint(77.59,12.97),4326)::geography,'coordinates',CURRENT_DATE,true)`;
  const image = await sharp({
    create: { width: 320, height: 200, channels: 3, background: "#627963" },
  })
    .jpeg()
    .toBuffer();
  for (const evidenceId of evidenceIds) {
    const objectKey = `evidence/${randomUUID()}.jpg`;
    const bytes = await putImage(objectKey, image);
    await sql`INSERT INTO evidence(id,issue_id,author_id,description,observation_date) VALUES(${evidenceId},${id},${session.user.id},'Synthetic follow-up fixture. No real repair or AI assessment is claimed.',CURRENT_DATE)`;
    await sql`INSERT INTO assets(id,issue_id,evidence_id,object_key,digest,mime,bytes) VALUES(${randomUUID()},${id},${evidenceId},${objectKey},'case-smoke-fixture','image/jpeg',${bytes})`;
  }
  let revision = 0;
  const payload = {
    authority: "Demo authority (sample only)",
    owner: "Demo coordinator",
    reference: "DEMO-CASE-001",
    sentDate: new Date().toISOString().slice(0, 10),
    sourceUrl: "https://example.com/demo",
    note: "Demo only. No authority was contacted. This checks the case workflow.",
    evidenceId: evidenceIds[0],
  };
  async function update(stage: CaseStage, patch = {}, client = admin) {
    return client.call(`/issues/${id}/progress`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, stage, revision, ...patch }),
    });
  }
  assert.equal((await update("assigned", {}, member)).status, 401);
  assert.equal((await update("in_progress")).status, 409);
  for (const stage of [
    "assigned",
    "sent",
    "acknowledged",
    "in_progress",
    "resolution_reported",
    "closed",
  ] as CaseStage[]) {
    assert.equal((await update(stage)).status, 200, `Stage failed: ${stage}`);
    revision++;
    const current = (await (await member.call(`/issues/${id}`)).json()) as any;
    assert.equal(current.caseProgress.stage, stage);
    assert.equal(current.caseRevision, revision);
  }
  assert.equal(
    (await update("closed", { revision: revision - 1 })).status,
    409,
  );
  assert.equal(
    (await update("reopened")).status,
    400,
    "Reopening must use different evidence.",
  );
  assert.equal(
    (await update("reopened", { evidenceId: evidenceIds[1] })).status,
    200,
  );
  revision++;
  const reopened = (await (await member.call(`/issues/${id}`)).json()) as any;
  assert.equal(reopened.status, "reopened");
  assert.equal(
    reopened.history.filter((item: any) => item.kind === "case_updated").length,
    7,
  );
  const vote = { support: true, confirmationDate: null, revision: 0 };
  assert.equal(
    (
      await member.call(`/issues/${id}/reactions`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(vote),
      })
    ).status,
    200,
  );
  assert.equal(
    ((await (await member.call(`/issues/${id}`)).json()) as any).supportCount,
    1,
  );
  console.log(
    "PASS assignment, handoff, acknowledgement, work progress, evidence-linked resolution, closure, reopening, public history, upvote, access checks, and stale-update rejection",
  );
  assert.equal((await member.call("/moderation/cases")).status, 401);
  assert.equal(
    (await admin.call("/moderation/cases?stage=unsupported")).status,
    400,
  );
  const queueProgress = {
    ...payload,
    stage: "acknowledged",
    updatedAt: new Date().toISOString(),
  };
  await sql.begin(async (tx) => {
    for (let n = 0; n < 27; n++) {
      const fixtureId = randomUUID();
      queueFixtures.push(fixtureId);
      await tx`INSERT INTO issues(id,author_id,title,description,category,latitude,longitude,point,location_source,observation_date,demo,visibility,case_progress,created_at)
        VALUES(${fixtureId},${session.user.id},'Demo: queue pagination fixture','Synthetic queue fixture. No real incident or authority contact is claimed.','pothole',12.97,77.59,ST_SetSRID(ST_MakePoint(77.59,12.97),4326)::geography,'coordinates',CURRENT_DATE,true,${n === 26 ? "hidden" : "public"},${tx.json(queueProgress)},'2026-10-18T00:00:00.123456Z')`;
    }
  });
  let nextCursor: string | null = null;
  const listed = new Set<string>();
  let pages = 0;
  do {
    const path =
      "/moderation/cases?stage=acknowledged" +
      (nextCursor ? "&cursor=" + encodeURIComponent(nextCursor) : "");
    const response = await admin.call(path);
    assert.equal(response.status, 200);
    const page = (await response.json()) as any;
    for (const item of page.cases) {
      assert(!listed.has(item.id), "Duplicate case across pages.");
      assert.equal(item.caseProgress.stage, "acknowledged");
      listed.add(item.id);
    }
    nextCursor = page.nextCursor;
    pages++;
    assert(pages < 20, "Case queue pagination did not finish.");
  } while (nextCursor);
  for (const fixtureId of queueFixtures.slice(0, 26))
    assert(
      listed.has(fixtureId),
      "Queue skipped a case with the same creation time.",
    );
  assert(
    !listed.has(queueFixtures[26]!),
    "Hidden case entered the public case queue.",
  );
  console.log(
    "PASS admin queue filters, multi-page results with equal timestamps, hidden-case exclusion, and member access denial",
  );
} finally {
  if (queueFixtures.length)
    await sql`UPDATE issues SET visibility='hidden' WHERE id=ANY(${queueFixtures}::uuid[])`;
  const response = await admin.call(`/moderation/content/issue/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      visibility: "hidden",
      reason:
        "Automated local case check completed; hide this synthetic fixture.",
    }),
  });
  assert.equal(response.status, 200);
  await Promise.all([sql.end(), authSql.end()]);
}
console.log(
  "PASS synthetic test issue hidden; no AI call or authority contact",
);
