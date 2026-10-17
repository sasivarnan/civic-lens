import type { Analysis } from "@civiclens/shared"
export function Findings({ analysis }: { analysis: Analysis }) {
  return (
    <div className="findings">
      <p className="eyebrow">AI suggestion · review required</p>
      {analysis.evidenceStatus === "insufficient" && (
        <p role="status" className="notice">
          <strong>Insufficient evidence</strong>. The image does not provide
          enough visible context for a civic category.
        </p>
      )}
      {!analysis.evidenceStatus && (
        <p className="text-xs text-muted-foreground">
          This earlier AI review has no recorded evidence assessment.
        </p>
      )}
      {(
        [
          ["Visible observations", analysis.observations],
          ["Resident claims", analysis.claims],
          ["Conflicts", analysis.conflicts],
          ["Unknowns", analysis.unknowns],
        ] as const
      ).map(([title, items]) => (
        <section key={title}>
          <h3>{title}</h3>
          {items.length ? (
            <ul>
              {items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">None listed by the model.</p>
          )}
        </section>
      ))}
      <section>
        <h3>Useful additional evidence</h3>
        <p>{analysis.nextEvidence}</p>
      </section>
      <p className="text-xs text-muted-foreground">
        These findings are not independent verification or a legal assessment.
      </p>
    </div>
  )
}
