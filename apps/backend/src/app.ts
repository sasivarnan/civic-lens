import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { z, ZodError } from "zod";
import { randomUUID } from "node:crypto";
import {
  reportSchema,
  observationDateSchema,
  locationSchema,
  categories,
  statuses,
  guides,
  type Issue,
} from "@civiclens/shared";
import { authConfig, authHandler, member, admin } from "./auth.js";
import { sql } from "./db.js";
import { config, maxImageBytes } from "./config.js";
import { analyze, embed, embeddingConfig } from "./models.js";
import {
  readImage,
  prepareImage,
  putImage,
  getImage,
  deleteImage,
} from "./media.js";
import {
  HttpError,
  hash,
  analyzedHash,
  signReceipt,
  verifyReceipt,
} from "./security.js";
const idSchema = z.string().uuid();
const iso = (value: any) =>
  value instanceof Date ? value.toISOString() : String(value);
const day = (value: any) => iso(value).slice(0, 10);
function publicIssue(r: any): Issue {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    status: r.status,
    latitude: r.latitude,
    longitude: r.longitude,
    observationDate: day(r.observation_date),
    createdAt: iso(r.created_at),
    demo: r.demo,
    assetId: r.asset_id ?? null,
    supportCount: Number(r.support_count ?? 0),
    confirmationCount: Number(r.confirmation_count ?? 0),
    analysis: r.analysis ?? undefined,
  };
}
const rates = new Map<string, { count: number; until: number }>();
function rate(key: string, limit = 20) {
  const now = Date.now();
  if (rates.size > 10000)
    for (const [k, v] of rates) if (v.until < now) rates.delete(k);
  const old = rates.get(key);
  if (!old || old.until < now) {
    rates.set(key, { count: 1, until: now + 60_000 });
    return;
  }
  if (++old.count > limit)
    throw new HttpError(429, "Too many requests. Please wait one minute.");
}
export const app = new Hono();
app.use(
  "*",
  secureHeaders({
    referrerPolicy: "strict-origin-when-cross-origin",
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "blob:", "data:", "https://tile.openstreetmap.org"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
      frameAncestors: ["'none'"],
    },
  }),
);
app.use(
  "/api/*",
  bodyLimit({
    maxSize: maxImageBytes + 65536,
    onError: (c) => c.json({ error: "Request exceeds the image limit." }, 413),
  }),
);
app.use("/api/*", authConfig);
app.use("/api/*", async (c, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
    !c.req.path.startsWith("/api/auth/")
  ) {
    if (c.req.header("origin") !== config.APP_ORIGIN)
      throw new HttpError(403, "Request origin is not allowed.");
  }
  await next();
});
app.onError((error, c) => {
  if (error instanceof ZodError)
    return c.json({ error: error.issues.map((x) => x.message).join(" ") }, 400);
  if (error instanceof HttpError)
    return c.json({ error: error.message }, error.status as any);
  console.error("Request failed:", error.name);
  return c.json(
    { error: "The service is unavailable. Please try again." },
    503,
  );
});
app.all("/api/auth/*", authHandler());
app.get("/api/health", async (c) => {
  try {
    await sql`SELECT 1`;
    return c.json({ status: "ready" });
  } catch {
    return c.json({ status: "database unavailable" }, 503);
  }
});
app.get("/api/issues", async (c) => {
  const query = z
    .object({
      south: z.coerce.number().min(-90).max(90).default(12.7),
      north: z.coerce.number().min(-90).max(90).default(13.3),
      west: z.coerce.number().min(-180).max(180).default(77.2),
      east: z.coerce.number().min(-180).max(180).default(77.95),
      category: z.enum(categories).optional(),
      status: z.enum(statuses).optional(),
      cursor: z.string().datetime().optional(),
    })
    .parse(c.req.query());
  if (query.south > query.north || query.west > query.east)
    throw new HttpError(400, "Invalid map bounds.");
  const rows =
    await sql`SELECT i.*,a.id asset_id,(SELECT count(*) FROM reactions WHERE issue_id=i.id AND support) support_count,(SELECT count(*) FROM reactions WHERE issue_id=i.id AND confirmation_date IS NOT NULL) confirmation_count FROM issues i LEFT JOIN assets a ON a.issue_id=i.id AND a.evidence_id IS NULL WHERE i.visibility='public' AND i.latitude BETWEEN ${query.south} AND ${query.north} AND i.longitude BETWEEN ${query.west} AND ${query.east} ${query.category ? sql`AND i.category=${query.category}` : sql``} ${query.status ? sql`AND i.status=${query.status}` : sql``} ${query.cursor ? sql`AND i.created_at < ${query.cursor}` : sql``} ORDER BY i.created_at DESC LIMIT 51`;
  return c.json({
    issues: rows.slice(0, 50).map(publicIssue),
    nextCursor: rows.length > 50 ? iso(rows[49]!.created_at) : null,
  });
});
app.get("/api/issues/:id", async (c) => {
  const id = idSchema.parse(c.req.param("id"));
  const [r] =
    await sql`SELECT i.*,a.id asset_id,(SELECT count(*) FROM reactions WHERE issue_id=i.id AND support) support_count,(SELECT count(*) FROM reactions WHERE issue_id=i.id AND confirmation_date IS NOT NULL) confirmation_count FROM issues i LEFT JOIN assets a ON a.issue_id=i.id AND a.evidence_id IS NULL WHERE i.id=${id} AND i.visibility='public'`;
  if (!r) throw new HttpError(404, "Issue not found.");
  const cursor = c.req.query("historyCursor");
  if (cursor) z.string().datetime().parse(cursor);
  const history =
    await sql`SELECT * FROM (SELECT e.id,e.description,e.observation_date,e.created_at,e.analysis,a.id asset_id,'evidence'::text kind FROM evidence e LEFT JOIN assets a ON a.evidence_id=e.id WHERE e.issue_id=${id} AND e.visibility='public' UNION ALL SELECT v.id,coalesce(v.reason,v.kind) description,NULL observation_date,v.created_at,NULL analysis,NULL asset_id,v.kind FROM events v WHERE v.issue_id=${id} AND v.kind<>'evidence_added') h WHERE true ${cursor ? sql`AND created_at<${cursor}` : sql``} ORDER BY created_at DESC LIMIT 21`;
  let reaction = {
    support: false,
    confirmationDate: null as string | null,
    revision: 0,
  };
  try {
    const u = await member(c);
    const [rr] =
      await sql`SELECT * FROM reactions WHERE user_id=${u.id} AND issue_id=${id}`;
    if (rr)
      reaction = {
        support: rr.support,
        confirmationDate: rr.confirmation_date
          ? day(rr.confirmation_date)
          : null,
        revision: rr.revision,
      };
  } catch (e) {
    if (!(e instanceof HttpError && e.status === 401)) throw e;
  }
  return c.json({
    ...publicIssue(r),
    guide: guides[r.category as keyof typeof guides],
    reaction,
    history: history.slice(0, 20).map((h) => ({
      id: h.id,
      description: h.description,
      observationDate: h.observation_date ? day(h.observation_date) : null,
      createdAt: iso(h.created_at),
      assetId: h.asset_id,
      analysis: h.analysis,
      kind: h.kind,
    })),
    nextHistoryCursor:
      history.length > 20 ? iso(history[19]!.created_at) : null,
  });
});
app.get("/api/assets/:id", async (c) => {
  const id = idSchema.parse(c.req.param("id"));
  const [a] =
    await sql`SELECT a.object_key FROM assets a JOIN issues i ON i.id=a.issue_id LEFT JOIN evidence e ON e.id=a.evidence_id WHERE a.id=${id} AND i.visibility='public' AND (a.evidence_id IS NULL OR e.visibility='public')`;
  if (!a) throw new HttpError(404, "Image not found.");
  c.header("Cache-Control", "private, no-store");
  c.header("Content-Type", "image/jpeg");
  c.header("X-Content-Type-Options", "nosniff");
  return new Response(Buffer.from(await getImage(a.object_key)), {
    headers: c.res.headers,
  });
});
app.post("/api/analyses", async (c) => {
  const u = await member(c);
  rate(u.id + ":analysis", 6);
  const form = await c.req.parseBody();
  const description = z
    .string()
    .trim()
    .min(10)
    .max(3000)
    .parse(form.description);
  if (form.imageApproved !== "true")
    throw new HttpError(400, "Approve the privacy-edited image first.");
  const image = await readImage(form.image);
  const { analysis, model, inputMaxEdge } = await analyze(
    await prepareImage(image),
    description,
  );
  return c.json({
    analysis,
    model,
    receipt: signReceipt(
      u.id,
      analyzedHash(image, description),
      analysis,
      model,
      inputMaxEdge,
    ),
  });
});
app.post("/api/related-reports", async (c) => {
  const u = await member(c);
  rate(u.id + ":search", 12);
  const input = z
    .object({
      description: z.string().trim().min(10).max(3000),
      location: locationSchema,
    })
    .parse(await c.req.json());
  const candidates =
    await sql`SELECT i.*,a.id asset_id FROM issues i LEFT JOIN assets a ON a.issue_id=i.id AND a.evidence_id IS NULL WHERE visibility='public' AND ST_DWithin(point,ST_SetSRID(ST_MakePoint(${input.location.longitude},${input.location.latitude}),4326)::geography,200) LIMIT 200`;
  if (!candidates.length) return c.json({ issues: [], radiusMeters: 200 });
  const vector = await embed(input.description, "query");
  const ranked =
    await sql`SELECT v.issue_id,1-(v.embedding <=> ${JSON.stringify(vector)}::vector) similarity FROM issue_vectors v JOIN issues i ON i.id=v.issue_id WHERE v.config=${embeddingConfig} AND i.visibility='public' AND ST_DWithin(i.point,ST_SetSRID(ST_MakePoint(${input.location.longitude},${input.location.latitude}),4326)::geography,200) ORDER BY v.embedding <=> ${JSON.stringify(vector)}::vector LIMIT 3`;
  return c.json({
    issues: ranked
      .map((x) => {
        const row = candidates.find((i) => i.id === x.issue_id);
        return row
          ? { ...publicIssue(row), similarity: Number(x.similarity) }
          : null;
      })
      .filter(Boolean),
    radiusMeters: 200,
  });
});
async function publish(c: any, target?: string) {
  const u = await member(c);
  rate(u.id + ":publish", 8);
  if (target) idSchema.parse(target);
  const key = z.string().min(8).max(100).parse(c.req.header("Idempotency-Key"));
  const form = await c.req.parseBody();
  const input = reportSchema.parse(JSON.parse(String(form.report ?? "{}")));
  const image = await readImage(form.image);
  const digest = hash(JSON.stringify(input) + hash(image));
  const id = randomUUID(),
    assetId = randomUUID(),
    objectKey = "evidence/" + assetId + ".jpg";
  let stored = false;
  let used = false;
  try {
    const result = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${u.id + ":" + key},0))`;
      const [old] =
        await tx`SELECT * FROM submissions WHERE user_id=${u.id} AND key=${key}`;
      if (old) {
        if (old.digest !== digest || old.target_id !== (target ?? "new"))
          throw new HttpError(
            409,
            "This submission key was used for different content.",
          );
        return {
          id: target ?? old.result_id,
          evidenceId: target ? old.result_id : null,
        };
      }
      const { analysis, model, issuedAt, inputMaxEdge } = verifyReceipt(
        input.receipt,
        u.id,
        analyzedHash(image, input.analyzedDescription),
      );
      if (target) {
        const existing =
          await tx`SELECT id FROM issues WHERE id=${target} AND visibility='public' FOR UPDATE`;
        if (!existing.length) throw new HttpError(404, "Issue not found.");
      }
      const audit = tx.json({
        description: input.analyzedDescription,
        inputHash: analyzedHash(image, input.analyzedDescription),
        imageHash: hash(image),
        model,
        imageMaxEdge: inputMaxEdge ?? null,
        analyzedAt: new Date(issuedAt).toISOString(),
      });
      const bytes = await putImage(objectKey, image);
      stored = true;
      if (target) {
        await tx`INSERT INTO evidence(id,issue_id,author_id,description,observation_date,analysis,model,analysis_input) VALUES(${id},${target},${u.id},${input.description},${input.observationDate},${tx.json(analysis)},${model},${audit})`;
      } else {
        await tx`INSERT INTO issues(id,author_id,title,description,category,latitude,longitude,point,location_source,observation_date,analysis,model,analysis_input) VALUES(${id},${u.id},${input.title},${input.description},${input.category},${input.location.latitude},${input.location.longitude},ST_SetSRID(ST_MakePoint(${input.location.longitude},${input.location.latitude}),4326)::geography,${input.location.source},${input.observationDate},${tx.json(analysis)},${model},${audit})`;
        await tx`INSERT INTO vector_jobs(issue_id) VALUES(${id})`;
      }
      await tx`INSERT INTO assets(id,issue_id,evidence_id,object_key,digest,mime,bytes) VALUES(${assetId},${target ?? id},${target ? id : null},${objectKey},${hash(image)},'image/jpeg',${bytes})`;
      await tx`INSERT INTO events(id,issue_id,actor_id,kind) VALUES(${randomUUID()},${target ?? id},${u.id},${target ? "evidence_added" : "reported"})`;
      await tx`INSERT INTO submissions(user_id,key,digest,target_id,result_id) VALUES(${u.id},${key},${digest},${target ?? "new"},${id})`;
      return { id: target ?? id, evidenceId: target ? id : null };
    });
    used = true;
    return c.json(result, 201);
  } finally {
    if (stored && !used) {
      try {
        const linked =
          await sql`SELECT id FROM assets WHERE object_key=${objectKey}`;
        if (!linked.length) await deleteImage(objectKey);
      } catch {
        console.error("Asset cleanup requires a later reconciliation.");
      }
    }
  }
}
app.post("/api/issues", (c) => publish(c));
app.post("/api/issues/:id/evidence", (c) => publish(c, c.req.param("id")));
app.put("/api/issues/:id/reactions", async (c) => {
  const u = await member(c);
  rate(u.id + ":reaction", 30);
  const id = idSchema.parse(c.req.param("id"));
  const input = z
    .object({
      support: z.boolean(),
      confirmationDate: observationDateSchema.nullable(),
      revision: z.number().int().min(0),
    })
    .parse(await c.req.json());
  const result = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${u.id + id},0))`;
    const parent =
      await tx`SELECT id FROM issues WHERE id=${id} AND visibility='public'`;
    if (!parent.length) throw new HttpError(404, "Issue not found.");
    const [old] =
      await tx`SELECT revision FROM reactions WHERE issue_id=${id} AND user_id=${u.id}`;
    if ((old?.revision ?? 0) !== input.revision)
      throw new HttpError(
        409,
        "This action changed. Refresh the issue and try again.",
      );
    const [r] =
      await tx`INSERT INTO reactions(issue_id,user_id,support,confirmation_date,revision) VALUES(${id},${u.id},${input.support},${input.confirmationDate},1) ON CONFLICT(issue_id,user_id) DO UPDATE SET support=excluded.support,confirmation_date=excluded.confirmation_date,revision=reactions.revision+1 RETURNING revision`;
    return r;
  });
  return c.json(result);
});
app.post("/api/issues/:id/flags", async (c) => {
  const u = await member(c);
  rate(u.id + ":flag", 5);
  const id = idSchema.parse(c.req.param("id"));
  const input = z
    .object({
      reason: z.string().trim().min(10).max(1000),
      evidenceId: z.string().uuid().optional(),
    })
    .parse(await c.req.json());
  const issue =
    await sql`SELECT id FROM issues WHERE id=${id} AND visibility='public'`;
  if (!issue.length) throw new HttpError(404, "Issue not found.");
  if (input.evidenceId) {
    const e =
      await sql`SELECT id FROM evidence WHERE id=${input.evidenceId} AND issue_id=${id} AND visibility='public'`;
    if (!e.length) throw new HttpError(404, "Evidence not found.");
  }
  await sql`INSERT INTO flags(id,issue_id,evidence_id,author_id,reason) VALUES(${randomUUID()},${id},${input.evidenceId ?? null},${u.id},${input.reason})`;
  return c.json({ ok: true }, 201);
});
app.get("/api/moderation/flags", async (c) => {
  await admin(c);
  const flags =
    await sql`SELECT f.id,f.issue_id,f.evidence_id,f.reason,f.created_at,i.title,i.visibility FROM flags f JOIN issues i ON i.id=f.issue_id ORDER BY f.created_at DESC LIMIT 100`;
  return c.json({ flags });
});
app.patch("/api/moderation/content/:type/:id", async (c) => {
  const u = await admin(c);
  const type = z.enum(["issue", "evidence"]).parse(c.req.param("type"));
  const id = idSchema.parse(c.req.param("id"));
  const input = z
    .object({
      visibility: z.enum(["public", "hidden"]).optional(),
      status: z.enum(statuses).optional(),
      reason: z.string().trim().min(10).max(1000),
      evidenceId: z.string().uuid().optional(),
    })
    .refine((x) => x.visibility || x.status)
    .parse(await c.req.json());
  if (type === "evidence" && input.status)
    throw new HttpError(400, "Evidence has no issue status.");
  await sql.begin(async (tx) => {
    const [item] =
      type === "issue"
        ? await tx`SELECT id FROM issues WHERE id=${id} FOR UPDATE`
        : await tx`SELECT issue_id id FROM evidence WHERE id=${id} FOR UPDATE`;
    if (!item) throw new HttpError(404, "Content not found.");
    if (input.status && input.status !== "reported") {
      if (!input.evidenceId)
        throw new HttpError(
          400,
          "Select public evidence for this status change.",
        );
      const e =
        await tx`SELECT id FROM evidence WHERE id=${input.evidenceId} AND issue_id=${item.id} AND visibility='public'`;
      if (!e.length)
        throw new HttpError(400, "Evidence does not belong to this issue.");
    }
    if (type === "issue") {
      if (input.visibility)
        await tx`UPDATE issues SET visibility=${input.visibility} WHERE id=${id}`;
      if (input.status)
        await tx`UPDATE issues SET status=${input.status} WHERE id=${id}`;
      if (input.visibility === "hidden")
        await tx`DELETE FROM issue_vectors WHERE issue_id=${id}`;
      if (input.visibility === "public")
        await tx`INSERT INTO vector_jobs(issue_id) VALUES(${id}) ON CONFLICT(issue_id) DO UPDATE SET attempts=0,available_at=now()`;
    } else if (input.visibility)
      await tx`UPDATE evidence SET visibility=${input.visibility} WHERE id=${id}`;
    await tx`INSERT INTO events(id,issue_id,actor_id,kind,reason,evidence_id) VALUES(${randomUUID()},${item.id},${u.id},${input.status ? "status_changed" : "visibility_changed"},${(input.status ?? input.visibility) + ": " + input.reason},${input.evidenceId ?? null})`;
  });
  return c.json({ ok: true });
});
app.all("/api/*", (c) => c.json({ error: "API route not found." }, 404));
