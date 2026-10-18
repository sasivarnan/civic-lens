import { useEffect, useRef, useState } from "react"
import { Dialog } from "@base-ui/react/dialog"
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
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (location.hash !== "#case-progress") return
    const frame = requestAnimationFrame(() => {
      panel.current?.scrollIntoView({ block: "start" })
      panel.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [])
  const progress = issue.caseProgress
  const previous = progress?.stage ?? "not_assigned"
  const [open, setOpen] = useState(false)
  return (
    <Card
      id="case-progress"
      ref={panel}
      tabIndex={-1}
      aria-label="Case progress"
    >
      <CardContent className="space-y-4 pt-6">
        <h2 className="text-lg">{caseStageLabels[previous]}</h2>
        <p className="text-xs text-muted-foreground">
          Manual community record. Assignment inside CivicLens does not mean an
          authority has accepted the case.
        </p>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="font-semibold">Assigned team</dt>
            <dd>{progress?.authority || "Not assigned"}</dd>
          </div>
          <div>
            <dt className="font-semibold">Follow-up owner</dt>
            <dd>{progress?.owner || "Not assigned"}</dd>
          </div>
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
        {progress && (
          <details className="space-y-3 text-sm">
            <summary className="cursor-pointer font-semibold">
              Latest update details
            </summary>
            <dl className="space-y-2">
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
          </details>
        )}
        {!canManage && (
          <p className="text-xs">
            A coordinator records progress here. Add later evidence to report a
            repair or an unresolved problem.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            className="text-link"
            to="/issues/$issueId/evidence/new"
            params={{ issueId: issue.id }}
          >
            Add repair or follow-up evidence
          </Link>
          {canManage && (
            <Dialog.Root open={open} onOpenChange={setOpen}>
              <Dialog.Trigger className="no-print" render={<Button />}>
                Manage case
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Backdrop className="case-dialog-backdrop no-print" />
                <Dialog.Popup className="case-dialog no-print">
                  <header className="case-dialog-header">
                    <div>
                      <Dialog.Title className="text-lg font-semibold">
                        Manage case
                      </Dialog.Title>
                      <Dialog.Description className="text-sm text-muted-foreground">
                        {issue.title}
                      </Dialog.Description>
                    </div>
                    <Dialog.Close render={<Button variant="outline" />}>
                      Close
                    </Dialog.Close>
                  </header>
                  <div className="case-dialog-body">
                    <CaseProgressEditor
                      key={issue.caseRevision ?? 0}
                      issue={issue}
                      ownerName={ownerName}
                      onUpdated={async () => {
                        await onUpdated()
                        setOpen(false)
                      }}
                    />
                  </div>
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function CaseProgressEditor({
  issue,
  ownerName,
  onUpdated,
}: {
  issue: Issue
  ownerName: string
  onUpdated: () => Promise<void>
}) {
  const progress = issue.caseProgress
  const previous = progress?.stage ?? "not_assigned"
  const [stage, setStage] = useState<CaseStage>(
    previous === "not_assigned" || previous === "reopened"
      ? "assigned"
      : previous === "assigned"
        ? "in_progress"
        : previous === "in_progress"
          ? "resolution_reported"
          : previous
  )
  const [authority, setAuthority] = useState(progress?.authority ?? "")
  const [owner, setOwner] = useState(progress?.owner ?? ownerName)
  const [reference, setReference] = useState(progress?.reference ?? "")
  const [sentDate, setSentDate] = useState(progress?.sentDate ?? "")
  const [sourceUrl, setSourceUrl] = useState(progress?.sourceUrl ?? "")
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
      evidenceId:
        stage === "resolution_reported" || stage === "reopened"
          ? evidenceId || undefined
          : undefined,
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
    <form
      onSubmit={(e) => void save(e)}
      className="mt-4 space-y-3"
      aria-label="Update case progress"
    >
      <p className="text-xs">
        Updates are public. Do not enter private contact details. Assignment
        does not mean that an authority has accepted the case.
      </p>
      <fieldset disabled={saving} className="space-y-3">
        <div className="space-y-2">
          <p className="sr-only" id="case-action-label">
            Choose an action
          </p>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-labelledby="case-action-label"
          >
            {caseTransitions[previous].map((value) => (
              <Button
                key={value}
                type="button"
                variant={stage === value ? "default" : "outline"}
                aria-pressed={stage === value}
                onClick={() => {
                  setStage(value)
                  if (value === "reopened" && previous !== "reopened")
                    setEvidenceId("")
                }}
              >
                {value === previous
                  ? value === "assigned"
                    ? "Update assignment"
                    : value === "resolution_reported"
                      ? "Update resolution"
                      : "Update note"
                  : value === "assigned"
                    ? "Assign team"
                    : value === "in_progress"
                      ? "Start work"
                      : value === "resolution_reported"
                        ? "Report resolution"
                        : "Reopen"}
              </Button>
            ))}
          </div>
        </div>
        <Label>
          Assigned team
          <Input
            value={authority}
            maxLength={160}
            onChange={(e) => setAuthority(e.target.value)}
            placeholder="Team or service name"
          />
        </Label>
        {stage !== "assigned" && (
          <Label>
            Update note
            <Textarea
              value={note}
              minLength={10}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe the work or evidence. Use at least 10 characters."
            />
          </Label>
        )}
        {(stage === "resolution_reported" || stage === "reopened") && (
          <div className="space-y-2">
            <Label>
              Later photo evidence
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
                Add later photo evidence before resolution or reopening. Close
                this dialog and select Add repair or follow-up evidence. Load
                earlier history if needed.
              </p>
            )}
          </div>
        )}
        <details className="space-y-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Optional details
          </summary>
          <Label>
            Public follow-up owner
            <Input
              value={owner}
              maxLength={100}
              onChange={(e) => setOwner(e.target.value)}
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
          {stage === "assigned" && (
            <Label>
              Assignment note
              <Textarea
                value={note}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional context for this assignment"
              />
            </Label>
          )}
        </details>
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
  )
}
