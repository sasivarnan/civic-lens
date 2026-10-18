import { useEffect, useState } from "react"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import {
  caseStageLabels,
  caseStages,
  categoryLabels,
  type CaseStage,
  type Issue,
} from "@civiclens/shared"
import { api } from "../lib/api"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { Badge } from "./ui/badge"
import { Label } from "./ui/label"

type QueueCase = Pick<
  Issue,
  "id" | "title" | "category" | "status" | "demo" | "createdAt" | "caseProgress"
>
type QueuePage = { cases: QueueCase[]; nextCursor: string | null }
function CaseQueue({ stage }: { stage: CaseStage | "all" }) {
  const [rows, setRows] = useState<QueueCase[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [moreBusy, setMoreBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    void api<QueuePage>("/moderation/cases?stage=" + stage)
      .then((page) => {
        if (active) {
          setRows(page.cases)
          setCursor(page.nextCursor)
        }
      })
      .catch((error: Error) => {
        if (active) setError(error.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [stage])
  async function loadMore() {
    if (!cursor || moreBusy) return
    setMoreBusy(true)
    setError("")
    try {
      const page = await api<QueuePage>(
        "/moderation/cases?stage=" +
          stage +
          "&cursor=" +
          encodeURIComponent(cursor)
      )
      setRows((old) => [
        ...old,
        ...page.cases.filter((row) => !old.some((item) => item.id === row.id)),
      ])
      setCursor(page.nextCursor)
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setMoreBusy(false)
    }
  }
  return (
    <div className="space-y-4" aria-busy={loading}>
      {loading && <p role="status">Loading cases…</p>}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {!loading && !error && !rows.length && (
        <p className="empty-state">
          No cases at this stage. Choose another stage.
        </p>
      )}
      <ul className="space-y-3" aria-label="Admin case queue">
        {rows.map((issue) => {
          const current = issue.caseProgress?.stage ?? "not_assigned"
          return (
            <li key={issue.id}>
              <Card>
                <CardContent className="grid gap-4 pt-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]">
                  <div className="min-w-0 space-y-2">
                    <p className="eyebrow">
                      {categoryLabels[issue.category]}
                      {issue.demo ? " · DEMO" : ""}
                    </p>
                    <h3 className="text-lg break-words">{issue.title}</h3>
                    <Badge variant="secondary">
                      {caseStageLabels[current]}
                    </Badge>
                  </div>
                  <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
                    <div className="min-w-0 break-words">
                      <dt className="font-semibold">Assigned team</dt>
                      <dd>{issue.caseProgress?.authority || "Not assigned"}</dd>
                    </div>
                    <div className="min-w-0 break-words">
                      <dt className="font-semibold">Follow-up owner</dt>
                      <dd>{issue.caseProgress?.owner || "Not assigned"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Last case update</dt>
                      <dd>
                        {issue.caseProgress?.updatedAt
                          ? new Date(
                              issue.caseProgress.updatedAt
                            ).toLocaleString("en-IN", {
                              timeZone: "Asia/Kolkata",
                            }) + " IST"
                          : "No case update yet"}
                      </dd>
                    </div>
                  </dl>
                  <Link
                    className="text-link self-center"
                    to="/issues/$issueId"
                    params={{ issueId: issue.id }}
                    search={{ full: true }}
                    hash="case-progress"
                    aria-label={"Open case: " + issue.title}
                  >
                    Open case →
                  </Link>
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ul>
      {cursor && (
        <Button
          variant="outline"
          disabled={moreBusy}
          onClick={() => void loadMore()}
        >
          {moreBusy ? "Loading more cases…" : "Load more cases"}
        </Button>
      )}
    </div>
  )
}
export function AdminWorkspace({
  contentReview,
}: {
  contentReview: React.ReactNode
}) {
  const { section = "cases", stage = "not_assigned" } = useSearch({
    strict: false,
  })
  const navigate = useNavigate()
  const [refresh, setRefresh] = useState(0)
  return (
    <div className="section space-y-5">
      <div className="page-heading">
        <h1>Admin workspace</h1>
        <p>Assign teams and review progress.</p>
      </div>
      <nav className="flex flex-wrap gap-5" aria-label="Admin sections">
        <Link
          className="text-link"
          to="/moderation"
          search={{ section: "cases", stage }}
          aria-current={section === "cases" ? "page" : undefined}
        >
          Cases
        </Link>
        <Link
          className="text-link"
          to="/moderation"
          search={{ section: "content", stage }}
          aria-current={section === "content" ? "page" : undefined}
        >
          Content review
        </Link>
      </nav>
      {section === "content" ? (
        contentReview
      ) : (
        <section className="space-y-4" aria-label="Case management">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Label className="min-w-56">
              Case stage
              <select
                className="privacy-effect"
                value={stage}
                onChange={(e) =>
                  void navigate({
                    to: "/moderation",
                    search: {
                      section: "cases",
                      stage: e.target.value as CaseStage | "all",
                    },
                  })
                }
              >
                <option value="all">All public cases</option>
                {caseStages.map((value) => (
                  <option key={value} value={value}>
                    {caseStageLabels[value]}
                  </option>
                ))}
              </select>
            </Label>
            <Button
              variant="outline"
              onClick={() => setRefresh((value) => value + 1)}
            >
              Refresh queue
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Newest public reports first.
          </p>
          <CaseQueue key={stage + ":" + refresh} stage={stage} />
        </section>
      )}
    </div>
  )
}
