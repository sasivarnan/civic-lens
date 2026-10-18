import { useEffect, useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import { FileDown, Layers } from "lucide-react"
import { categoryLabels, caseStageLabels, type Issue } from "@civiclens/shared"
import { Button } from "./ui/button"
import { Findings } from "./Findings"

export function IssueReport({ issue }: { issue: Issue }) {
  const report = useRef<HTMLElement>(null)
  const [error, setError] = useState("")
  const [preparing, setPreparing] = useState(false)
  const [exportedAt] = useState(
    () =>
      new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(new Date()) + " IST"
  )
  const source = location.origin + "/issues/" + issue.id
  useEffect(() => {
    report.current?.querySelector("h1")?.focus({ preventScroll: true })
  }, [])
  async function printReport() {
    setPreparing(true)
    setError("")
    try {
      await document.fonts?.ready
      await Promise.all(
        Array.from(report.current?.querySelectorAll("img") ?? []).map(
          (image) =>
            typeof image.decode === "function"
              ? image.decode()
              : Promise.resolve()
        )
      )
      window.print()
    } catch {
      setError(
        "An evidence image could not load. Reload the report before saving it."
      )
    } finally {
      setPreparing(false)
    }
  }
  return (
    <div className="report-preview">
      <div className="report-toolbar no-print">
        <div>
          <Link to="/issues/$issueId" params={{ issueId: issue.id }}>
            ← Back to issue
          </Link>
          <p>A4 report. In the print dialog, turn off headers and footers.</p>
        </div>
        <Button disabled={preparing} onClick={() => void printReport()}>
          <FileDown />
          {preparing ? "Prepare report…" : "Print / Save as PDF"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="report-error no-print">
          {error}
        </p>
      )}
      <article
        ref={report}
        className="evidence-report"
        aria-label="Community evidence report"
      >
        <header className="report-masthead">
          <span className="report-brand">
            <Layers size={22} />
            CivicLens
          </span>
          <span>BENGALURU / COMMUNITY EVIDENCE</span>
        </header>
        <div className="report-title">
          <p className="report-kicker">
            {categoryLabels[issue.category]}
            {issue.demo ? " / DEMO" : ""}
          </p>
          <h1 tabIndex={-1}>{issue.title}</h1>
          <p className="report-id">Report ID: {issue.id}</p>
        </div>
        <dl className="report-facts">
          <div>
            <dt>Status</dt>
            <dd>
              {
                {
                  reported: "Reported",
                  resolution_reported: "Resolution reported",
                  reopened: "Reopened",
                }[issue.status]
              }
            </dd>
          </div>
          <div>
            <dt>Observed</dt>
            <dd>{issue.observationDate}</dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>{issue.createdAt.slice(0, 10)}</dd>
          </div>
          <div>
            <dt>Incident coordinates</dt>
            <dd>
              {issue.latitude.toFixed(6)}, {issue.longitude.toFixed(6)}
            </dd>
          </div>
        </dl>
        {issue.caseProgress && (
          <section className="report-section">
            <h2>Case progress</h2>
            <p>{caseStageLabels[issue.caseProgress.stage]}</p>
            <p>
              Authority: {issue.caseProgress.authority || "Not assigned"}.
              Follow-up owner: {issue.caseProgress.owner || "Not assigned"}.
            </p>
            <p>
              Reference: {issue.caseProgress.reference || "Not recorded"}.
              Handoff date: {issue.caseProgress.sentDate || "Not recorded"}.
            </p>
            <p>{issue.caseProgress.note}</p>
            <p className="report-note">
              Updated: {issue.caseProgress.updatedAt}. Manual community record.
              This does not prove official acceptance or closure.
            </p>
            {issue.caseProgress.sourceUrl && (
              <p className="report-note">
                Source: {issue.caseProgress.sourceUrl}
              </p>
            )}
          </section>
        )}
        <section className="report-section">
          <h2>Resident report</h2>
          <p className="report-description">{issue.description}</p>
          <p className="report-note">
            {issue.confirmationCount} community observations ·{" "}
            {issue.supportCount} upvotes. Observations and upvotes are separate
            records.
          </p>
        </section>
        {issue.assetId && (
          <section className="report-section">
            <h2>Submitted evidence</h2>
            <figure>
              <img
                src={"/api/assets/" + issue.assetId}
                alt={issue.title}
                loading="eager"
              />
              <figcaption>
                Privacy-edited evidence copy. Not an untouched original.
              </figcaption>
            </figure>
          </section>
        )}
        {issue.analysis && (
          <section className="report-section">
            <h2>AI findings and limits</h2>
            <Findings analysis={issue.analysis} />
          </section>
        )}
        {!!issue.history?.length && (
          <section className="report-section">
            <h2>Public issue history</h2>
            {issue.history.map((entry) => (
              <div className="report-history-entry" key={entry.id}>
                <h3>
                  {entry.observationDate ?? entry.createdAt.slice(0, 10)} /{" "}
                  {entry.kind?.replaceAll("_", " ") ?? "Update"}
                </h3>
                <p className="report-description">{entry.description}</p>
                {entry.assetId && (
                  <figure>
                    <img
                      src={"/api/assets/" + entry.assetId}
                      alt="Later privacy-edited evidence"
                      loading="eager"
                    />
                    <figcaption>Later privacy-edited evidence copy.</figcaption>
                  </figure>
                )}
                {entry.analysis && <Findings analysis={entry.analysis} />}
              </div>
            ))}
          </section>
        )}
        {issue.guide && (
          <section className="report-section report-guide">
            <h2>Suggested next steps</h2>
            <h3>{issue.guide.title}</h3>
            <ol>
              {issue.guide.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
            <p className="report-note">
              Source reviewed: {issue.guide.reviewedAt}.{" "}
              {issue.guide.limitation}
            </p>
            <a
              href={issue.guide.source}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open official source"
            >
              {issue.guide.source}
            </a>
          </section>
        )}
        <footer className="report-footer">
          <strong>Community evidence. Human review required.</strong>
          <p>
            This report is not independent verification or a government
            complaint. It includes the public history available when loaded.
          </p>
          <p>Report loaded: {exportedAt}</p>
          <a href={source}>{source}</a>
        </footer>
      </article>
    </div>
  )
}
