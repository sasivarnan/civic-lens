import { useEffect, useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { followUpEvidenceSchema, today, type Issue } from "@civiclens/shared"
import { api } from "../lib/api"
import { newId } from "../lib/uuid"
import { PrivacyEditor } from "./PrivacyEditor"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Textarea } from "./ui/textarea"

export function FollowUpEditor({
  issueId,
  signedIn,
}: {
  issueId: string
  signedIn: boolean
}) {
  const navigate = useNavigate()
  const [issue, setIssue] = useState<Issue | null>(null)
  const [original, setOriginal] = useState<File | null>(null)
  const [approved, setApproved] = useState<File | null>(null)
  const [version, setVersion] = useState(0)
  const [date, setDate] = useState(today())
  const [note, setNote] = useState("")
  const [consent, setConsent] = useState(false)
  const [key, setKey] = useState(newId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    void api<Issue>("/issues/" + issueId)
      .then((value) => {
        if (active) setIssue(value)
      })
      .catch((error: Error) => {
        if (active) setError(error.message)
      })
    return () => {
      active = false
    }
  }, [issueId])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (original) {
        event.preventDefault()
        event.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [original])
  function changed() {
    setConsent(false)
    setKey(newId())
  }
  function choose(file?: File) {
    if (!file || busy) return
    setOriginal(null)
    setApproved(null)
    setVersion((old) => old + 1)
    changed()
    setError("")
    if (!file.size || file.size > 8 * 1024 * 1024) {
      setError("Select an image smaller than 8 MB.")
      return
    }
    setOriginal(file)
  }
  async function publish() {
    if (!approved || !issue || !consent || busy || !signedIn) return
    setError("")
    const parsed = followUpEvidenceSchema.safeParse({
      observationDate: date,
      note,
      imageApproved: true,
      finalApproved: consent,
    })
    if (!parsed.success) {
      setError(parsed.error.issues.map((item) => item.message).join(" "))
      return
    }
    setBusy(true)
    const body = new FormData()
    body.set("image", approved)
    body.set("evidence", JSON.stringify(parsed.data))
    try {
      await api("/issues/" + issueId + "/evidence", {
        method: "POST",
        body,
        headers: { "Idempotency-Key": key },
      })
      setOriginal(null)
      await navigate({
        to: "/issues/$issueId",
        params: { issueId },
        search: { full: true },
        hash: "case-progress",
      })
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="editor-page follow-up-page">
      <div className="page-heading">
        <h1>Add later evidence</h1>
        {issue ? (
          <>
            <p>{issue.title}</p>
            <p className="text-sm">
              Uses the existing issue location. This photo does not change case
              status.
            </p>
          </>
        ) : (
          !error && <p role="status">Loading issue…</p>
        )}
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {issue && (
        <Card>
          <CardContent className="space-y-5 pt-6">
            <fieldset disabled={busy} className="space-y-4">
              <Label htmlFor="followup-photo">Choose photo</Label>
              <Input
                id="followup-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => choose(event.target.files?.[0])}
              />
              <label className="text-link cursor-pointer">
                Take photo on phone
                <input
                  className="sr-only"
                  aria-label="Take photo on phone"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => choose(event.target.files?.[0])}
                />
              </label>
              {original && (
                <PrivacyEditor
                  key={version}
                  file={original}
                  onEdit={() => {
                    setApproved(null)
                    changed()
                  }}
                  onApprove={(file) => {
                    setApproved(file)
                    changed()
                  }}
                />
              )}
              <Label>
                Observation date
                <Input
                  type="date"
                  value={date}
                  max={today()}
                  onChange={(event) => {
                    setDate(event.target.value)
                    changed()
                  }}
                />
              </Label>
              <details>
                <summary className="cursor-pointer font-semibold">
                  Add a note (optional)
                </summary>
                <Label className="mt-3">
                  Photo note
                  <Textarea
                    value={note}
                    maxLength={1000}
                    onChange={(event) => {
                      setNote(event.target.value)
                      changed()
                    }}
                  />
                </Label>
              </details>
              <p className="text-sm text-muted-foreground">
                Community photo. No AI assessment. Check that it shows this
                issue and location.
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={!approved || busy}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                I approve this photo and date for public sharing.
              </label>
              {!signedIn && (
                <p>
                  <Link to="/sign-in" className="text-link">
                    Sign in to add evidence
                  </Link>
                </p>
              )}
              <div className="flex flex-wrap items-center gap-4">
                <Button
                  disabled={!approved || !consent || busy || !signedIn}
                  onClick={() => void publish()}
                >
                  {busy ? "Publishing evidence…" : "Publish later evidence"}
                </Button>
                <Link
                  to="/issues/$issueId"
                  params={{ issueId }}
                  search={{ full: true }}
                  className="text-link"
                >
                  Back to issue
                </Link>
              </div>
            </fieldset>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
