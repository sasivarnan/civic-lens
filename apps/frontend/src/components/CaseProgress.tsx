import { useState } from "react"
import { Link } from "@tanstack/react-router"
import {
  caseStageLabels,
  caseTransitions,
  caseProgressSchema,
  type CaseStage,
  type Issue,
} from "@civiclens/shared"
import { api } from "../lib/api"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Textarea } from "./ui/textarea"
import { Card, CardContent } from "./ui/card"

export function CaseProgress({
  issue,
  canManage,
  ownerName,
  onUpdated,
}: {
  issue: Issue
  canManage: boolean
  ownerName: string
  onUpdated: () => Promise<void>
}) {
  const progress = issue.caseProgress
  const previous = progress?.stage ?? "not_assigned"
  const [stage, setStage] = useState<CaseStage>(progress?.stage ?? "assigned")
  const [authority, setAuthority] = useState(progress?.authority ?? "")
  const [owner, setOwner] = useState(progress?.owner ?? ownerName)
  const [reference, setReference] = useState(progress?.reference ?? "")
  const [sentDate, setSentDate] = useState(progress?.sentDate ?? "")
  const [sourceUrl, setSourceUrl] = useState(
    progress?.sourceUrl ?? issue.guide?.source ?? ""
  )
  const [evidenceId, setEvidenceId] = useState(progress?.evidenceId ?? "")
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const evidence =
    issue.history?.filter((item) => item.kind === "evidence" && item.assetId) ??
    []
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    const input = caseProgressSchema.safeParse({
      stage,
      authority,
      owner,
      reference,
      sentDate,
      sourceUrl,
      note,
      evidenceId: evidenceId || undefined,
      revision: issue.caseRevision ?? 0,
    })
    if (!input.success) {
      setError(input.error.issues.map((item) => item.message).join(" "))
      return
    }
    setSaving(true)
    try {
      await api("/issues/" + issue.id + "/progress", {
        method: "PATCH",
        body: JSON.stringify(input.data),
      })
      await onUpdated()
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <p className="eyebrow">CASE PROGRESS</p>
        <h2 className="text-lg">{caseStageLabels[previous]}</h2>
        <p className="text-xs text-muted-foreground">
          Manual community record. Assignment inside CivicLens does not mean an
          authority has accepted the case.
        </p>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="font-semibold">Authority / service</dt>
            <dd>{progress?.authority || "Not assigned"}</dd>
          </div>
          <div>
            <dt className="font-semibold">Follow-up owner</dt>
            <dd>{progress?.owner || "Not assigned"}</dd>
          </div>
          <div>
            <dt className="font-semibold">Complaint reference</dt>
            <dd>{progress?.reference || "Not recorded"}</dd>
          </div>
          {progress?.sentDate && (
            <div>
              <dt className="font-semibold">Handoff date</dt>
              <dd>{progress.sentDate}</dd>
            </div>
          )}
          {progress?.updatedAt && (
            <div>
              <dt className="font-semibold">Last updated</dt>
              <dd>
                {new Date(progress.updatedAt).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                })}{" "}
                IST
              </dd>
            </div>
          )}
        </dl>
        {progress?.note && (
          <p className="text-sm whitespace-pre-wrap">{progress.note}</p>
        )}
        {progress?.sourceUrl && (
          <a
            className="text-link"
            href={progress.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open update source
          </a>
        )}
        {previous === "closed" && (
          <p className="text-xs">
            Case closed after community review. This is not proof of official
            closure.
          </p>
        )}
        {!canManage && (
          <p className="text-xs">
            A coordinator records progress here. Add later evidence to report a
            repair or an unresolved problem.
          </p>
        )}
        <Link
          className="text-link"
          to="/issues/$issueId/evidence/new"
          params={{ issueId: issue.id }}
        >
          Add repair or follow-up evidence
        </Link>
        {canManage && (
          <details className="no-print" open>
            <summary className="cursor-pointer font-semibold">
              Update case (admin)
            </summary>
            <form
              onSubmit={(e) => void save(e)}
              className="mt-4 space-y-3"
              aria-label="Update case progress"
            >
              <p className="text-xs">
                All fields and notes below are public. Do not enter private
                contact details. Record the source of each update. Label sample
                handoffs as demo data.
              </p>
              <fieldset disabled={saving} className="space-y-3">
                <Label>
                  Next progress stage
                  <select
                    className="privacy-effect"
                    value={stage}
                    onChange={(e) => setStage(e.target.value as CaseStage)}
                  >
                    {caseTransitions[previous].map((value) => (
                      <option key={value} value={value}>
                        {caseStageLabels[value]}
                      </option>
                    ))}
                  </select>
                </Label>
                <Label>
                  Authority or service name
                  <Input
                    value={authority}
                    maxLength={160}
                    onChange={(e) => setAuthority(e.target.value)}
                    placeholder="Check the responsible agency before assignment"
                  />
                </Label>
                <Label>
                  Public follow-up owner
                  <Input
                    value={owner}
                    maxLength={100}
                    onChange={(e) => setOwner(e.target.value)}
                    placeholder="Coordinator name or team"
                  />
                </Label>
                <Label>
                  Complaint reference
                  <Input
                    value={reference}
                    maxLength={120}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </Label>
                <Label>
                  Handoff date
                  <Input
                    type="date"
                    value={sentDate}
                    onChange={(e) => setSentDate(e.target.value)}
                  />
                </Label>
                <Label>
                  Public source link
                  <Input
                    type="url"
                    value={sourceUrl}
                    maxLength={500}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://"
                  />
                </Label>
                <Label>
                  Later evidence for resolution or reopening
                  <select
                    className="privacy-effect"
                    value={evidenceId}
                    onChange={(e) => setEvidenceId(e.target.value)}
                  >
                    <option value="">Select later photo evidence</option>
                    {evidence.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.observationDate} — {item.description.slice(0, 70)}
                      </option>
                    ))}
                  </select>
                </Label>
                {!evidence.length && (
                  <p className="text-xs">
                    Add public later photo evidence before resolution, closure,
                    or reopening. Load earlier history if needed.
                  </p>
                )}
                <Label>
                  Public update and source details
                  <Textarea
                    value={note}
                    minLength={10}
                    maxLength={1000}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Explain this update and the evidence that supports it."
                  />
                </Label>
                {error && (
                  <p role="alert" className="error-box">
                    {error}
                  </p>
                )}
                <Button type="submit">
                  {saving ? "Saving update…" : "Save case update"}
                </Button>
              </fieldset>
            </form>
          </details>
        )}
      </CardContent>
    </Card>
  )
}
