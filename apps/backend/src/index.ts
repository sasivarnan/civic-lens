import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { app } from "./app.js";
import { config } from "./config.js";
import { sql, authSql } from "./db.js";
import { runVectorJob } from "./jobs.js";
const root = "../frontend/dist";
if (existsSync(root)) {
  app.use("/*", serveStatic({ root }));
  app.get("*", (c) => {
    if (c.req.path.includes(".") || c.req.path.startsWith("/api/"))
      return c.notFound();
    return serveStatic({ path: root + "/index.html" })(
      c,
      async () => {},
    ) as Promise<Response>;
  });
} else
  app.get("/", (c) =>
    c.json({
      service: "CivicLens API",
      frontend: "Run the frontend development server.",
    }),
  );
const server = serve({ fetch: app.fetch, port: config.PORT }, () =>
  console.log(`CivicLens API listening on port ${config.PORT}`),
);
const jobs = setInterval(() => void runVectorJob(), 15000);
jobs.unref();
process.on("SIGTERM", () => {
  clearInterval(jobs);
  server.close(() => {
    void Promise.all([sql.end(), authSql.end()]).then(() => process.exit(0));
  });
});
