import type { Context } from "hono";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  caseProgressSchema,
  caseTransitions,
  caseStageLabels,
  type CaseStage,
} from "@civiclens/shared";
import { admin } from "./auth.js";
import { sql } from "./db.js";
import { HttpError } from "./security.js";

export async function updateCase(c: Context) {
  const user = await admin(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const submitted = z.record(z.string(), z.unknown()).parse(await c.req.json());
  const input = caseProgressSchema.parse({
    ...submitted,
    owner: submitted.owner || user.name || "CivicLens coordinator",
  });
  const { revision, ...fields } = input;
  await sql.begin(async (tx) => {
    const [issue] =
      await tx`SELECT id,status,case_progress,case_revision FROM issues WHERE id=${id} AND visibility='public' FOR UPDATE`;
    if (!issue) throw new HttpError(404, "Public issue not found.");
    if (issue.case_revision !== revision)
      throw new HttpError(
        409,
        "This case changed. Reload the issue before saving.",
      );
    const previous: CaseStage = issue.case_progress?.stage ?? "not_assigned";
    if (!caseTransitions[previous].includes(input.stage))
      throw new HttpError(
        409,
        "This progress step is not available from the current stage.",
      );
    if (
      input.stage === "reopened" &&
      input.evidenceId === issue.case_progress?.evidenceId
    )
      throw new HttpError(
        400,
        "Select different later evidence before reopening this case.",
      );
    if (input.evidenceId) {
      const evidence =
        await tx`SELECT e.id FROM evidence e JOIN assets a ON a.evidence_id=e.id WHERE e.id=${input.evidenceId} AND e.issue_id=${id} AND e.visibility='public'`;
      if (!evidence.length)
        throw new HttpError(
          400,
          "Select public later photo evidence from this issue.",
        );
    }
    const note =
      fields.note ||
      "Internal team assignment. Authority acceptance is not confirmed.";
    const progress = { ...fields, note, updatedAt: new Date().toISOString() };
    const status =
      input.stage === "resolution_reported"
        ? "resolution_reported"
        : input.stage === "reopened"
          ? "reopened"
          : previous === "resolution_reported"
            ? "reopened"
            : issue.status;
    await tx`UPDATE issues SET case_progress=${tx.json(progress)},case_revision=case_revision+1,status=${status} WHERE id=${id}`;
    const summary = [
      caseStageLabels[input.stage] + ".",
      "Team: " + input.authority + ".",
      "Follow-up owner: " + input.owner + ".",
      input.reference && "Reference: " + input.reference + ".",
      input.sentDate && "Handoff date: " + input.sentDate + ".",
      input.sourceUrl && "Source: " + input.sourceUrl + ".",
      note,
    ]
      .filter(Boolean)
      .join(" ");
    await tx`INSERT INTO events(id,issue_id,actor_id,kind,reason,evidence_id) VALUES(${randomUUID()},${id},${user.id},'case_updated',${summary},${input.evidenceId ?? null})`;
  });
  c.header("Cache-Control", "no-store");
  return c.json({ ok: true, revision: revision + 1 });
}
