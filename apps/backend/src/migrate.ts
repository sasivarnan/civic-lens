import { readFile } from "node:fs/promises";
import { sql } from "./db.js";
await sql.begin(async (tx) => {
  await tx`SELECT pg_advisory_xact_lock(148926)`;
  await tx`CREATE TABLE IF NOT EXISTS migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  for (const name of [
    "0001_initial",
    "0002_analysis_audit",
    "0003_case_progress",
    "0004_simple_case_stages",
  ]) {
    const done = await tx`SELECT name FROM migrations WHERE name=${name}`;
    if (done.length) continue;
    await tx.unsafe(
      await readFile(
        new URL("../migrations/" + name + ".sql", import.meta.url),
        "utf8",
      ),
    );
    await tx`INSERT INTO migrations(name) VALUES(${name})`;
  }
});
console.log("Database migrations applied.");
await sql.end();
