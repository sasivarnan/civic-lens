import { sql } from "./db.js";
import { embed, embeddingConfig } from "./models.js";
let busy = false;
export async function runVectorJob() {
  if (busy) return;
  busy = true;
  try {
    const [job] =
      await sql`UPDATE vector_jobs SET attempts=attempts+1,available_at=now()+interval '2 minutes' WHERE issue_id=(SELECT issue_id FROM vector_jobs WHERE available_at<=now() AND attempts<5 ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING issue_id`;
    if (!job) return;
    const [issue] =
      await sql`SELECT title,description FROM issues WHERE id=${job.issue_id} AND visibility='public'`;
    if (!issue) {
      await sql`DELETE FROM vector_jobs WHERE issue_id=${job.issue_id}`;
      return;
    }
    try {
      const v = await embed(issue.title + "\n" + issue.description, "document");
      await sql.begin(async (tx) => {
        await tx`INSERT INTO issue_vectors(issue_id,embedding,config) SELECT id,${JSON.stringify(v)}::vector,${embeddingConfig} FROM issues WHERE id=${job.issue_id} AND visibility='public' ON CONFLICT(issue_id) DO UPDATE SET embedding=excluded.embedding,config=excluded.config,updated_at=now()`;
        await tx`DELETE FROM vector_jobs WHERE issue_id=${job.issue_id}`;
      });
    } catch {
      await sql`UPDATE vector_jobs SET last_error='embedding unavailable' WHERE issue_id=${job.issue_id}`;
    }
  } catch {
    /* A database outage is retried by the next poll. */
  } finally {
    busy = false;
  }
}
