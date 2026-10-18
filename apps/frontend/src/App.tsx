import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
  Link,
  useNavigate,
  useParams,
  useLocation,
  useSearch,
} from "@tanstack/react-router"
import { Dialog } from "@base-ui/react/dialog"
import { useStore, useSelector } from "@xstate/store-react"
import {
  ArrowUpRight,
  ArrowRight,
  MapPin,
  Plus,
  ShieldCheck,
  Eye,
  Layers,
  FileDown,
  Flag,
  Check,
  LoaderCircle,
  Accessibility,
  Footprints,
  Construction,
  LogOut,
} from "lucide-react"
import exifr from "exifr"
import {
  today,
  categories,
  categoryLabels,
  isPublishableAnalysis,
  type Issue,
  type Analysis,
  type ReportInput,
} from "@civiclens/shared"
import { Button } from "./components/ui/button"
import { Card, CardContent } from "./components/ui/card"
import { Input } from "./components/ui/input"
import { Textarea } from "./components/ui/textarea"
import { Label } from "./components/ui/label"
import { Badge } from "./components/ui/badge"
import { PrivacyEditor } from "./components/PrivacyEditor"
import { Findings } from "./components/Findings"
import { IssueReport } from "./components/IssueReport"
import { api, sendEmailLink, signOut, loadSession, type Session } from "./lib/api"
const Map = lazy(() => import("./components/Map"))
const SessionContext = createContext<Session | null>(null)
const statusLabel = (s: string) =>
  ({
    reported: "Reported",
    resolution_reported: "Resolution reported",
    reopened: "Reopened",
  })[s] ?? s
const categoryIcon = {
  pedestrian: Footprints,
  accessibility: Accessibility,
  pothole: Construction,
}
function ErrorText({ error }: { error: string }) {
  return error ? (
    <p className="error-box" role="alert">
      {error}
    </p>
  ) : null
}
function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="animate-spin" size={20} />
      Loading…
    </div>
  )
}
function Root() {
  const [session, setSession] = useState<Session | null>(null)
  const [authError, setAuthError] = useState("")
  const [signingOut, setSigningOut] = useState(false)
  useEffect(() => {
    void loadSession()
      .then(setSession)
      .catch((error: Error) => { setSession({}); setAuthError(error.message) })
  }, [])
  return (
    <SessionContext.Provider value={session}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link to="/" className="brand">
          <span className="brand-symbol">
            <Layers size={20} />
          </span>
          CivicLens<span className="brand-city">BENGALURU</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link to="/issues" activeProps={{ className: "active" }}>
            Explore
          </Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/report/new" className="nav-report">
            <Plus size={16} />
            Report an issue
          </Link>
          {session?.user?.demo ? (
            <span className="text-sm">Demo visitor</span>
          ) : session?.user ? (
            <button
              className="quiet-button"
              disabled={signingOut}
              onClick={() => {
                setSigningOut(true)
                setAuthError("")
                void signOut()
                  .catch((error: Error) => setAuthError(error.message))
                  .finally(() => setSigningOut(false))
              }}
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
          ) : (
            <Link to="/sign-in">Sign in</Link>
          )}
        </nav>
      </header>
      <main id="main">
        {session?.demoMode && (
          <p className="notice" role="status">
            Hackathon demo. No email sign-in is needed. Reports and locations are public. Use sample evidence.
          </p>
        )}
        <ErrorText error={authError} />
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>CivicLens · Evidence for better neighbourhoods.</span>
        <span>
          Community reports. Human review. <Link to="/privacy">Privacy</Link>
          {session?.demoMode && <> · <Link to="/sign-in">Admin sign-in</Link></>}
        </span>
      </footer>
    </SessionContext.Provider>
  )
}
function IssueCard({ issue }: { issue: Issue }) {
  const Icon = categoryIcon[issue.category]
  return (
    <Link
      to="/issues/$issueId"
      params={{ issueId: issue.id }}
      resetScroll={false}
      className="issue-card"
    >
      <div className="issue-card-image">
        {issue.assetId ? (
          <img
            src={"/api/assets/" + issue.assetId}
            alt={issue.title}
            loading="lazy"
          />
        ) : (
          <div className="image-placeholder">
            <Icon size={36} />
            <span>Demo report · no photo</span>
          </div>
        )}
        <Badge className="image-badge" variant="secondary">
          {statusLabel(issue.status)}
        </Badge>
      </div>
      <div className="issue-card-body">
        <p className="eyebrow">
          <Icon size={13} />
          {categoryLabels[issue.category]}
          {issue.demo ? " · DEMO" : ""}
        </p>
        <h3>
          {issue.title}
          <ArrowUpRight size={17} />
        </h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {issue.description}
        </p>
        <div className="issue-card-meta">
          <span>
            <MapPin size={13} />
            {issue.latitude.toFixed(3)}, {issue.longitude.toFixed(3)}
          </span>
          <span>
            {issue.confirmationCount} observed · {issue.supportCount} support
          </span>
        </div>
      </div>
    </Link>
  )
}
function Home() {
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    void api<{ issues: Issue[] }>("/issues")
      .then((result) => {
        if (active) setIssues(result.issues.slice(0, 3))
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="live-dot" />
            BUILT FOR OUR NEIGHBOURHOODS
          </p>
          <h1>
            Small observations.
            <br />
            <span>Better streets.</span>
          </h1>
          <p>
            Turn a street problem into a clear community report.
            <br />
            Review the evidence. Find related reports. Share useful next steps.
          </p>
          <div className="hero-actions">
            <Link to="/report/new" className="primary-link">
              Report an issue
              <ArrowUpRight size={17} />
            </Link>
            <Link to="/issues" className="text-link">
              Explore issues
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="hero-notes">
            <span>
              <ShieldCheck size={15} />
              Privacy before upload
            </span>
            <span>
              <Eye size={15} />
              Evidence, with human review
            </span>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="city-block block-a" />
          <div className="city-block block-b" />
          <div className="city-block block-c" />
          <div className="city-block block-d" />
          <div className="city-road road-a" />
          <div className="city-road road-b" />
          <div className="map-dot dot-one">
            <Accessibility size={20} />
          </div>
          <div className="map-dot dot-two">
            <Footprints size={20} />
          </div>
          <div className="map-dot dot-three">
            <Construction size={20} />
          </div>
          <div className="visual-caption">
            <span className="live-dot" />
            Bengaluru, one observation at a time
          </div>
          <span className="visual-label">COMMUNITY EVIDENCE MAP</span>
        </div>
      </section>
      <section className="section" aria-labelledby="recent-issues">
        <div className="section-title">
          <div>
            <p className="eyebrow">THE COMMUNITY RECORD</p>
            <h2 id="recent-issues">Recent reports</h2>
          </div>
          <Link to="/issues" className="text-link">
            View all issues <ArrowRight size={16} />
          </Link>
        </div>
        <ErrorText error={error} />
        {loading ? (
          <Loading />
        ) : issues.length ? (
          <div className="issue-grid">
            {issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        ) : !error ? (
          <p>No reports yet. Your observation can start the record.</p>
        ) : null}
      </section>
      <section className="how-section">
        <p className="eyebrow">FROM OBSERVATION TO ACTION</p>
        <div className="how-grid">
          {[
            [
              "01",
              "Make the evidence safe",
              "Cover private details on your device. You approve the exact image that leaves it.",
            ],
            [
              "02",
              "Review what it shows",
              "Compare what the photo shows with the reported problem. AI suggestions keep observations, claims, and uncertainty separate.",
            ],
            [
              "03",
              "Build a shared record",
              "Connect related reports, add later evidence, and export useful next steps.",
            ],
          ].map(([n, title, text]) => (
            <div key={n}>
              <span className="step-number">{n}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
function Explore() {
  const navigate = useNavigate()
  const [issues, setIssues] = useState<Issue[]>([]),
    [category, setCategory] = useState(""),
    [view, setView] = useState<"list" | "map">("map"),
    [error, setError] = useState(""),
    [loadedQuery, setLoadedQuery] = useState<string | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [area, setArea] = useState<Record<string, number> | null>(null)
  const query = useMemo(() => {
    const p = new URLSearchParams(category ? { category } : {})
    if (area) Object.entries(area).forEach(([k, v]) => p.set(k, String(v)))
    return p.toString()
  }, [category, area])
  const loading = loadedQuery !== query
  useEffect(() => {
    let live = true
    void api<{ issues: Issue[]; nextCursor: string | null }>("/issues?" + query)
      .then((r) => {
        if (live) {
          setIssues(r.issues)
          setCursor(r.nextCursor)
          setError("")
        }
      })
      .catch((e) => {
        if (live) setError(e.message)
      })
      .finally(() => {
        if (live) setLoadedQuery(query)
      })
    return () => {
      live = false
    }
  }, [query])
  return (
    <section className="section">
      <div className="section-title">
        <div>
          <p className="eyebrow">THE COMMUNITY RECORD</p>
          <h1 id="explore-heading" tabIndex={-1}>
            Explore issues
          </h1>
        </div>
        <div className="view-switch" aria-label="View type">
          <button
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            List
          </button>
          <button aria-pressed={view === "map"} onClick={() => setView("map")}>
            Map
          </button>
        </div>
      </div>
      <div className="filter-row">
        <button
          className={!category ? "selected" : ""}
          onClick={() => setCategory("")}
        >
          All issues
        </button>
        {categories.map((c) => {
          const Icon = categoryIcon[c]
          return (
            <button
              key={c}
              className={category === c ? "selected" : ""}
              onClick={() => setCategory(c)}
            >
              <Icon size={15} />
              {categoryLabels[c]}
            </button>
          )
        })}
        <span className="filter-note">Published community observations</span>
      </div>
      <ErrorText error={error} />
      {view === "map" && (
        <Suspense fallback={<Loading />}>
          <Map
            issues={issues}
            onBounds={(b) => setArea(b)}
            onIssueSelect={(issueId) =>
              void navigate({
                to: "/issues/$issueId",
                params: { issueId },
                resetScroll: false,
              })
            }
          />
        </Suspense>
      )}
      {loading ? (
        <Loading />
      ) : issues.length ? (
        <div className="issue-grid">
          {issues.map((i) => (
            <IssueCard key={i.id} issue={i} />
          ))}
        </div>
      ) : !error ? (
        <div className="empty-state">
          <MapPin size={28} />
          <h3>No reports in this area yet.</h3>
          <p>Your observation can start the record.</p>
          <Link to="/report/new">
            Report an issue <ArrowRight size={15} />
          </Link>
        </div>
      ) : null}
      {cursor && (
        <Button
          variant="outline"
          onClick={() =>
            void api<{ issues: Issue[]; nextCursor: string | null }>(
              "/issues?" + query + "&cursor=" + encodeURIComponent(cursor)
            )
              .then((r) => {
                setIssues((old) => [...old, ...r.issues])
                setCursor(r.nextCursor)
              })
              .catch((e) => setError(e.message))
          }
        >
          Load more reports
        </Button>
      )}
    </section>
  )
}

type EditorState = {
  photoVersion: number
  original: File | null
  approved: File | null
  imageApproved: boolean
  description: string
  reviewedDescription: string
  title: string
  category: (typeof categories)[number]
  latitude: string
  longitude: string
  source: "photo_gps" | "device" | "map" | "coordinates"
  locationConfirmed: boolean
  gps: { latitude: number; longitude: number } | null
  date: string
  analysis: Analysis | null
  receipt: string
  analyzedDescription: string
  finalApproved: boolean
  key: string
}
function Editor() {
  const { issueId } = useParams({ strict: false }) as { issueId?: string }
  const session = useContext(SessionContext),
    navigate = useNavigate()
  const store = useStore({
    context: {
      photoVersion: 0,
      original: null,
      approved: null,
      imageApproved: false,
      description: "",
      reviewedDescription: "",
      title: "",
      category: "accessibility",
      latitude: "",
      longitude: "",
      source: "coordinates",
      locationConfirmed: false,
      gps: null,
      date: today(),
      analysis: null,
      receipt: "",
      analyzedDescription: "",
      finalApproved: false,
      key: crypto.randomUUID(),
    } as EditorState,
    on: {
      patch: (state, event: { value: Partial<EditorState> }) => ({
        ...state,
        ...event.value,
      }),
    },
  })
  const s = useSelector(store, (x) => x.context)
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [related, setRelated] = useState<Issue[]>([]),
    [searched, setSearched] = useState(false),
    [target, setTarget] = useState<string | undefined>(issueId)
  const patch = (value: Partial<EditorState>) => store.trigger.patch({ value })
  const changed = (value: Partial<EditorState>) => {
    patch({ ...value, finalApproved: false, key: crypto.randomUUID() })
  }
  const point = useMemo(
    () =>
      s.latitude &&
      s.longitude &&
      Number.isFinite(Number(s.latitude)) &&
      Number.isFinite(Number(s.longitude))
        ? { latitude: Number(s.latitude), longitude: Number(s.longitude) }
        : null,
    [s.latitude, s.longitude]
  )
  function setPoint(lat: string, lng: string, source: EditorState["source"]) {
    changed({ latitude: lat, longitude: lng, source, locationConfirmed: false })
    setRelated([])
    setSearched(false)
    if (!issueId) setTarget(undefined)
  }
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (s.original) {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [s.original])
  async function select(file?: File) {
    if (!file) return
    const current = store.getSnapshot().context
    patch({
      photoVersion: current.photoVersion + 1,
      original: null,
      approved: null,
      imageApproved: false,
      analysis: null,
      receipt: "",
      gps: null,
      locationConfirmed: false,
      finalApproved: false,
      key: crypto.randomUUID(),
      ...(current.source === "photo_gps"
        ? { latitude: "", longitude: "", source: "coordinates" as const }
        : {}),
    })
    setRelated([])
    setSearched(false)
    if (!issueId) setTarget(undefined)
    if (file.size > 8 * 1024 * 1024) {
      setError("Select an image smaller than 8 MB.")
      return
    }
    patch({ original: file })
    setError("")
    try {
      const gps = await exifr.gps(file)
      if (
        store.getSnapshot().context.original === file &&
        gps &&
        Number.isFinite(gps.latitude) &&
        Number.isFinite(gps.longitude)
      )
        patch({ gps })
    } catch {
      /* Missing or malformed GPS does not block manual input. */
    }
  }
  async function review() {
    if (!s.approved) return
    setBusy("Reviewing evidence")
    setError("")
    const photo = s.approved,
      description = s.description
    const body = new FormData()
    body.set("image", photo)
    body.set("description", description)
    body.set("imageApproved", "true")
    try {
      const r = await api<{ analysis: Analysis; receipt: string }>(
        "/analyses",
        { method: "POST", body }
      )
      const now = store.getSnapshot().context
      if (now.approved !== photo || now.description !== description) return
      changed({
        analysis: r.analysis,
        receipt: r.receipt,
        analyzedDescription: description,
        reviewedDescription: description,
        category: r.analysis.category ?? now.category,
      })
      setRelated([])
      setSearched(false)
      setTarget(issueId)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy("")
    }
  }
  async function search() {
    if (!isPublishableAnalysis(s.analysis)) return
    setBusy("Finding related reports")
    setError("")
    const latitude = s.latitude,
      longitude = s.longitude,
      description = s.reviewedDescription
    try {
      const r = await api<{ issues: Issue[] }>("/related-reports", {
        method: "POST",
        body: JSON.stringify({
          description,
          location: {
            latitude: Number(latitude),
            longitude: Number(longitude),
            source: s.source,
            confirmed: s.locationConfirmed,
          },
        }),
      })
      const now = store.getSnapshot().context
      if (
        now.latitude !== latitude ||
        now.longitude !== longitude ||
        now.reviewedDescription !== description
      )
        return
      setRelated(r.issues)
      setSearched(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy("")
    }
  }
  async function publish() {
    if (!s.approved || !isPublishableAnalysis(s.analysis)) return
    setBusy("Publishing evidence")
    setError("")
    const input: ReportInput = {
      title: s.title,
      description: s.reviewedDescription,
      category: s.category,
      observationDate: s.date,
      location: {
        latitude: Number(s.latitude),
        longitude: Number(s.longitude),
        source: s.source,
        confirmed: true,
      },
      analyzedDescription: s.analyzedDescription,
      receipt: s.receipt,
      imageApproved: true,
      finalApproved: true,
    }
    const body = new FormData()
    body.set("image", s.approved)
    body.set("report", JSON.stringify(input))
    try {
      const r = await api<{ id: string }>(
        target ? "/issues/" + target + "/evidence" : "/issues",
        { method: "POST", body, headers: { "Idempotency-Key": s.key } }
      )
      patch({ original: null })
      await navigate({ to: "/issues/$issueId", params: { issueId: r.id } })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy("")
    }
  }
  return (
    <div className="editor-page">
      <div className="page-heading">
        <p className="eyebrow">
          {issueId ? "ADD TO THE RECORD" : "A NEW COMMUNITY OBSERVATION"}
        </p>
        <h1>{issueId ? "Add later evidence" : "Report an issue"}</h1>
        <p>Keep private details covered. Keep the evidence clear.</p>
      </div>
      <div className="editor-layout">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <h2>
                <span className="number-circle">1</span>Photo and privacy
              </h2>
              <Label htmlFor="photo">Select a still photo</Label>
              <Input
                id="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => void select(e.target.files?.[0])}
              />
              {s.original && (
                <PrivacyEditor
                  key={s.photoVersion}
                  file={s.original}
                  onEdit={() =>
                    changed({
                      approved: null,
                      imageApproved: false,
                      analysis: null,
                      receipt: "",
                    })
                  }
                  onApprove={(file) =>
                    changed({
                      approved: file,
                      imageApproved: true,
                      analysis: null,
                      receipt: "",
                    })
                  }
                />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <h2>
                <span className="number-circle">2</span>Incident location
              </h2>
              <p className="text-sm text-muted-foreground">
                The confirmed incident point will be public. Photo and device
                positions are suggestions.
              </p>
              <div className="flex flex-wrap gap-2">
                {s.gps && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setPoint(
                        String(s.gps!.latitude),
                        String(s.gps!.longitude),
                        "photo_gps"
                      )
                    }
                  >
                    Use photo location
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!navigator.geolocation) {
                      setError(
                        "Device location is unavailable. Use the map or coordinate fields."
                      )
                      return
                    }
                    navigator.geolocation.getCurrentPosition(
                      (p) =>
                        setPoint(
                          String(p.coords.latitude),
                          String(p.coords.longitude),
                          "device"
                        ),
                      () =>
                        setError(
                          "Device location was not available. Use the map or coordinate fields."
                        ),
                      { timeout: 10000, maximumAge: 0 }
                    )
                  }}
                >
                  Use current location
                </Button>
              </div>
              <Suspense fallback={<Loading />}>
                <Map
                  point={point}
                  onSelect={(lat, lng) =>
                    setPoint(lat.toFixed(6), lng.toFixed(6), "map")
                  }
                />
              </Suspense>
              <div className="two-fields">
                <Label>
                  Latitude
                  <Input
                    type="number"
                    step="any"
                    value={s.latitude}
                    onChange={(e) =>
                      setPoint(e.target.value, s.longitude, "coordinates")
                    }
                  />
                </Label>
                <Label>
                  Longitude
                  <Input
                    type="number"
                    step="any"
                    value={s.longitude}
                    onChange={(e) =>
                      setPoint(s.latitude, e.target.value, "coordinates")
                    }
                  />
                </Label>
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.locationConfirmed}
                  disabled={!point}
                  onChange={(e) =>
                    changed({ locationConfirmed: e.target.checked })
                  }
                />
                I checked this incident point and understand that it will be
                public.
              </label>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <h2>
                <span className="number-circle">3</span>Describe your
                observation
              </h2>
              <Label>
                Short title
                <Input
                  maxLength={140}
                  value={s.title}
                  onChange={(e) => changed({ title: e.target.value })}
                  placeholder="For example: damaged ramp near the crossing"
                />
              </Label>
              <Label>
                What did you observe?
                <Textarea
                  rows={4}
                  maxLength={3000}
                  value={s.description}
                  onChange={(e) => {
                    changed({
                      description: e.target.value,
                      analysis: null,
                      receipt: "",
                    })
                    setSearched(false)
                    setRelated([])
                  }}
                  placeholder="Describe the issue and its effect. Do not include personal details."
                />
              </Label>
              <Label>
                Observation date
                <Input
                  type="date"
                  max={today()}
                  value={s.date}
                  onChange={(e) => changed({ date: e.target.value })}
                />
              </Label>
              {!session?.user && (
                <p className="notice">
                  Sign in before AI review. <Link to="/sign-in">Sign in</Link>{" "}
                  or <Link to="/sign-up">create an account</Link>.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                AI suggests findings from your approved photo and description.
                Review each suggestion before sharing.
              </p>
              <Button
                disabled={
                  !session?.user ||
                  !s.imageApproved ||
                  !s.locationConfirmed ||
                  s.description.trim().length < 10 ||
                  !!busy
                }
                onClick={() => void review()}
              >
                {busy === "Reviewing evidence" ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Eye />
                )}
                Review evidence
              </Button>
            </CardContent>
          </Card>
          {s.analysis && (
            <Card>
              <CardContent className="space-y-4 pt-6">
                <h2>
                  <span className="number-circle">4</span>Review evidence
                </h2>
                <Findings analysis={s.analysis} />
                {isPublishableAnalysis(s.analysis) ? (
                  <>
                    <Label>
                      Reviewed category
                      <select
                        value={s.category}
                        onChange={(e) =>
                          changed({
                            category: e.target.value as EditorState["category"],
                          })
                        }
                      >
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {categoryLabels[c]}
                          </option>
                        ))}
                      </select>
                    </Label>
                    <Label>
                      Reviewed public description
                      <Textarea
                        rows={4}
                        value={s.reviewedDescription}
                        maxLength={3000}
                        onChange={(e) => {
                          changed({ reviewedDescription: e.target.value })
                          setRelated([])
                          setSearched(false)
                        }}
                      />
                    </Label>
                    {!issueId && (
                      <>
                        <Button
                          variant="outline"
                          disabled={
                            !!busy ||
                            !s.locationConfirmed ||
                            s.reviewedDescription.length < 10
                          }
                          onClick={() => void search()}
                        >
                          Find possibly related reports
                        </Button>
                        {searched && !related.length && (
                          <p className="text-sm">
                            No indexed related reports were found nearby. This
                            does not prove there is no existing issue.
                          </p>
                        )}
                        {related.map((i) => (
                          <label className="related-option" key={i.id}>
                            <input
                              type="radio"
                              name="target"
                              checked={target === i.id}
                              onChange={() => {
                                setTarget(i.id)
                                changed({})
                              }}
                            />
                            <span>
                              {i.title}
                              <small>
                                {i.observationDate} · {statusLabel(i.status)} ·{" "}
                                {i.latitude.toFixed(4)},{" "}
                                {i.longitude.toFixed(4)}
                              </small>
                            </span>
                            <Link
                              to="/issues/$issueId"
                              params={{ issueId: i.id }}
                              target="_blank"
                            >
                              View
                            </Link>
                          </label>
                        ))}
                        <label className="check">
                          <input
                            type="radio"
                            name="target"
                            checked={!target}
                            onChange={() => {
                              setTarget(undefined)
                              changed({})
                            }}
                          />
                          Publish a separate issue
                        </label>
                      </>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Check the approved photo, public point, title,
                      description, category, date, and AI findings above.
                      Similarity does not establish that reports describe the
                      same issue.
                    </p>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={s.finalApproved}
                        onChange={(e) =>
                          patch({ finalApproved: e.target.checked })
                        }
                      />
                      I approve this content for public sharing.
                    </label>
                    <Button
                      disabled={
                        !!busy ||
                        !s.finalApproved ||
                        !s.locationConfirmed ||
                        !s.imageApproved ||
                        s.title.trim().length < 5 ||
                        s.reviewedDescription.trim().length < 10
                      }
                      onClick={() => void publish()}
                    >
                      {busy === "Publishing evidence" ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <ArrowUpRight />
                      )}
                      {target ? "Publish later evidence" : "Publish issue"}
                    </Button>
                  </>
                ) : (
                  <p className="notice">
                    Select a clearer or more relevant photo in step 1. Review
                    privacy, confirm the location, and run AI review again.
                    Publication is blocked for this image. AI can make mistakes.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          <ErrorText error={error} />
          {busy && (
            <p role="status" className="notice">
              {busy}…
            </p>
          )}
        </div>
        <aside className="editor-aside">
          <ShieldCheck size={25} />
          <h3>Your review comes first.</h3>
          <p>
            Only your approved image leaves this device. Face detection can miss
            private details.
          </p>
          <hr />
          <h3>A shared record, not a verdict.</h3>
          <p>
            AI can make mistakes. Check its observations and keep uncertain
            claims clear.
          </p>
          <hr />
          <p>
            Unfinished work stays in browser memory. Closing or refreshing this
            page can lose it.
          </p>
        </aside>
      </div>
    </div>
  )
}
function Detail({
  print = false,
  embedded = false,
}: {
  print?: boolean
  embedded?: boolean
}) {
  const { issueId } = useParams({ strict: false }) as { issueId: string }
  const session = useContext(SessionContext)
  const [issue, setIssue] = useState<
      (Issue & { nextHistoryCursor?: string | null }) | null
    >(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [confirmationDate, setConfirmationDate] = useState(today()),
    [flag, setFlag] = useState(""),
    [notice, setNotice] = useState("")
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focused = useRef(false)
  useEffect(() => {
    focused.current = false
  }, [issueId, embedded, print])
  useEffect(() => {
    if (issue && !embedded && !focused.current) {
      headingRef.current?.focus({ preventScroll: true })
      focused.current = true
    }
  }, [issue, embedded])
  const refresh = () => api<Issue>("/issues/" + issueId).then(setIssue)
  useEffect(() => {
    let active = true
    void (async () => {
      let result = await api<Issue & { nextHistoryCursor?: string | null }>(
        "/issues/" + issueId
      )
      if (print) {
        while (result.nextHistoryCursor) {
          const page = await api<Issue & { nextHistoryCursor?: string | null }>(
            "/issues/" +
              issueId +
              "?historyCursor=" +
              encodeURIComponent(result.nextHistoryCursor)
          )
          result = {
            ...result,
            history: [...(result.history ?? []), ...(page.history ?? [])],
            nextHistoryCursor: page.nextHistoryCursor,
          }
        }
      }
      if (active) setIssue(result)
    })()
      .catch((e) => {
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [issueId, print])
  async function react(support: boolean, confirmation: string | null) {
    if (!issue) return
    setBusy(true)
    try {
      await api("/issues/" + issueId + "/reactions", {
        method: "PUT",
        body: JSON.stringify({
          support,
          confirmationDate: confirmation,
          revision: issue.reaction?.revision ?? 0,
        }),
      })
      await refresh()
      setError("")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const latitude = issue?.latitude
  const longitude = issue?.longitude
  const point = useMemo(
    () =>
      latitude !== undefined && longitude !== undefined
        ? { latitude, longitude }
        : null,
    [latitude, longitude]
  )
  if (!issue)
    return (
      <div className="section">
        <ErrorText error={error} />
        {!error && <Loading />}
      </div>
    )
  if (print) return <IssueReport issue={issue} />
  return (
    <article className="detail-page">
      <div className="detail-top no-print">
        {!embedded && <Link to="/issues">← All issues</Link>}
        <Link to="/issues/$issueId/print" params={{ issueId }}>
          Export report <FileDown size={16} />
        </Link>
      </div>
      <div className="detail-heading">
        <p className="eyebrow">
          {categoryLabels[issue.category]}
          {issue.demo ? " · SEEDED DEMO" : ""}
        </p>
        <h1 ref={headingRef} tabIndex={-1}>
          {issue.title}
        </h1>
        <div className="flex flex-wrap gap-3">
          <Badge variant="secondary">{statusLabel(issue.status)}</Badge>
          <span className="text-sm text-muted-foreground">
            Observed {issue.observationDate} · Submitted{" "}
            {issue.createdAt.slice(0, 10)}
          </span>
        </div>
      </div>
      {embedded && (
        <p className="panel-summary">
          {issue.confirmationCount} observations · {issue.supportCount} support
          · {categoryLabels[issue.category]}
        </p>
      )}
      <div className="detail-layout">
        <div className="space-y-6">
          {issue.assetId && (
            <figure>
              <img
                className="evidence-image"
                src={"/api/assets/" + issue.assetId}
                alt={issue.title}
              />
              <figcaption>
                Privacy-edited evidence copy. Not an untouched original.
              </figcaption>
            </figure>
          )}
          <Card>
            <CardContent className="pt-6">
              <p className="eyebrow">RESIDENT REPORT</p>
              <p className="mt-3 whitespace-pre-wrap">{issue.description}</p>
            </CardContent>
          </Card>
          {issue.analysis && (
            <Card>
              <CardContent className="pt-6">
                <Findings analysis={issue.analysis} />
              </CardContent>
            </Card>
          )}
          <section>
            <div className="section-title">
              <h2>Evidence history</h2>
              <Link
                className="text-link no-print"
                to="/issues/$issueId/evidence/new"
                params={{ issueId }}
              >
                Add evidence <Plus size={16} />
              </Link>
            </div>
            {issue.history?.length ? (
              <div className="timeline">
                {issue.history.map((h) => (
                  <div className="timeline-item" key={h.id}>
                    <p className="eyebrow">
                      {h.kind === "evidence"
                        ? "LATER EVIDENCE"
                        : h.kind?.replaceAll("_", " ")}{" "}
                      · {h.observationDate ?? h.createdAt.slice(0, 10)}
                    </p>
                    <p>{h.description}</p>
                    {h.assetId && (
                      <img
                        src={"/api/assets/" + h.assetId}
                        alt="Later privacy-edited evidence"
                        loading="lazy"
                      />
                    )}
                    {h.analysis && <Findings analysis={h.analysis} />}
                  </div>
                ))}
              </div>
            ) : (
              <p>No later evidence yet.</p>
            )}
            {issue.nextHistoryCursor && (
              <Button
                variant="outline"
                className="no-print"
                onClick={() =>
                  void api<Issue & { nextHistoryCursor: string | null }>(
                    "/issues/" +
                      issueId +
                      "?historyCursor=" +
                      encodeURIComponent(issue.nextHistoryCursor!)
                  )
                    .then((r) =>
                      setIssue((old) =>
                        old
                          ? {
                              ...old,
                              history: [
                                ...(old.history ?? []),
                                ...(r.history ?? []),
                              ],
                              nextHistoryCursor: r.nextHistoryCursor,
                            }
                          : r
                      )
                    )
                    .catch((e) => setError(e.message))
                }
              >
                Load earlier history
              </Button>
            )}
          </section>
        </div>
        <aside className="space-y-5">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <p className="eyebrow">INCIDENT LOCATION</p>
              <p className="text-sm">
                <MapPin size={14} className="inline" />{" "}
                {issue.latitude.toFixed(6)}, {issue.longitude.toFixed(6)}
              </p>
              {!embedded && (
                <Suspense fallback={<Loading />}>
                  <Map point={point} />
                </Suspense>
              )}
              <div className="community-counts">
                <span>
                  <strong>{issue.confirmationCount}</strong>observations
                </span>
                <span>
                  <strong>{issue.supportCount}</strong>support
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                A confirmation records a member's observation. Support requests
                action.
              </p>
              {session?.user ? (
                <div className="no-print space-y-3">
                  <Button
                    className="w-full"
                    variant={issue.reaction?.support ? "secondary" : "default"}
                    disabled={busy}
                    onClick={() =>
                      void react(
                        !issue.reaction?.support,
                        issue.reaction?.confirmationDate ?? null
                      )
                    }
                  >
                    {issue.reaction?.support ? (
                      <Check size={16} />
                    ) : (
                      <Plus size={16} />
                    )}{" "}
                    {issue.reaction?.support
                      ? "Withdraw support"
                      : "Support action"}
                  </Button>
                  <Label>
                    When did you observe this issue?
                    <Input
                      type="date"
                      value={confirmationDate}
                      max={today()}
                      onChange={(e) => setConfirmationDate(e.target.value)}
                    />
                  </Label>
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void react(
                        issue.reaction?.support ?? false,
                        issue.reaction?.confirmationDate
                          ? null
                          : confirmationDate
                      )
                    }
                  >
                    {issue.reaction?.confirmationDate
                      ? "Withdraw my observation"
                      : "I observed this issue"}
                  </Button>
                </div>
              ) : (
                <Link to="/sign-in" className="text-link">
                  Sign in to contribute <ArrowRight size={15} />
                </Link>
              )}
            </CardContent>
          </Card>
          {issue.guide && (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <p className="eyebrow">SUGGESTED NEXT STEPS</p>
                <h2 className="text-lg">{issue.guide.title}</h2>
                <ol className="guide-steps">
                  {issue.guide.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                <a
                  href={issue.guide.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-link"
                >
                  Open official source <ArrowUpRight size={15} />
                </a>
                <p className="text-xs text-muted-foreground">
                  Reviewed {issue.guide.reviewedAt}. {issue.guide.limitation}
                </p>
              </CardContent>
            </Card>
          )}
          {session?.user && (
            <details className="flag-box">
              <summary>
                <Flag size={14} />
                Report unsafe content
              </summary>
              <Label>
                Reason
                <Textarea
                  value={flag}
                  onChange={(e) => setFlag(e.target.value)}
                  maxLength={1000}
                />
              </Label>
              <Button
                variant="outline"
                disabled={busy || flag.trim().length < 10}
                onClick={() => {
                  setBusy(true)
                  void api("/issues/" + issueId + "/flags", {
                    method: "POST",
                    body: JSON.stringify({ reason: flag }),
                  })
                    .then(() => {
                      setNotice("Your report was sent for admin review.")
                      setFlag("")
                    })
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false))
                }}
              >
                Send for review
              </Button>
            </details>
          )}
        </aside>
      </div>
      <ErrorText error={error} />
      {notice && <p role="status">{notice}</p>}
    </article>
  )
}
function AuthPage({ signup = false }: { signup?: boolean }) {
  const session = useContext(SessionContext)
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(
      new URLSearchParams(location.search).get("sent") === "true"
    ),
    [error, setError] = useState(
      new URLSearchParams(location.search).has("error")
        ? "Sign-in was not completed. Request a new link."
        : ""
    )
  if (session?.user && !session.user.demo)
    return (
      <div className="prose-page">
        <h1>Already signed in</h1>
        <p>Your account is ready. You can continue with your report.</p>
        <Link to="/report/new">Continue to reporting</Link>
      </div>
    )
  return (
    <div className="auth-page">
      <div className="auth-art">
        <span className="brand-symbol">
          <Layers />
        </span>
        <p className="auth-tagline">
          A better record.
          <br />A stronger community.
        </p>
        <p>Observe. Review. Contribute.</p>
      </div>
      <Card>
        <CardContent className="space-y-5 pt-8">
          <p className="eyebrow">WELCOME TO CIVICLENS</p>
          <h1>{signup ? "Create your account" : "Sign in"}</h1>
          <p className="text-muted-foreground">
            We will email a one-time sign-in link. No password is required.
          </p>
          {sent ? (
            <div className="notice" role="status">
              <Check size={19} />
              <div>
                <p>Check your email. Use the link within 15 minutes.</p>
                <Button variant="link" onClick={() => setSent(false)}>
                  Use a different email
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                setBusy(true)
                setError("")
                void sendEmailLink(email)
                  .then(() => setSent(true))
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false))
              }}
            >
              <Label>
                Email address
                <Input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </Label>
              {signup && (
                <label className="check">
                  <input required type="checkbox" />I understand that reports
                  and incident locations are public.{" "}
                  <Link to="/privacy">Read the privacy information.</Link>
                </label>
              )}
              <Button className="w-full" type="submit" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <ArrowRight />
                )}
                Send sign-in link
              </Button>
            </form>
          )}
          <ErrorText error={error} />
          <p className="text-sm">
            {signup ? "Already a member?" : "New to CivicLens?"}{" "}
            <Link to={signup ? "/sign-in" : "/sign-up"}>
              {signup ? "Sign in" : "Create an account"}
            </Link>
          </p>
          <p className="text-xs text-muted-foreground">
            Your account is created after email verification. Your email address
            is not shown on public issues.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
function Privacy() {
  return (
    <div className="prose-page">
      <p className="eyebrow">YOUR EVIDENCE, WITH CARE</p>
      <h1>Privacy and community reporting</h1>
      {[
        [
          "Before upload",
          "Your original photo stays on your device. Photo GPS is read locally when available. Face suggestions and manual solid covers help you prepare a new image. Detection can miss faces and other private details. Review the exact exported copy.",
        ],
        [
          "What becomes public",
          "The approved image, confirmed incident coordinates, reviewed report, observation dates, labelled AI findings, and visible issue history become public. Removing photo GPS does not remove the separately confirmed incident location.",
        ],
        [
          "AI processing",
          "After you request review, the approved image and description go to the configured Gemma service. Its findings can be wrong. EmbeddingGemma compares reviewed text with nearby public reports. Provider handling and retention terms must be checked before public release.",
        ],
        [
          "Accounts and community actions",
          "Email is used for sign-in. Public reports do not reveal account emails or provider IDs. Confirmation means a member reports an observation; support means they request action. Neither establishes independent verification.",
        ],
        [
          "Unfinished work",
          "Forms and image edits stay in browser memory. There are no server drafts. Closing or refreshing the page can lose unfinished work.",
        ],
        [
          "Moderation and removal",
          "Use the report control on an issue to request admin review. Admins can hide unsafe content. Downloaded images and PDFs cannot be revoked. A production retention, deletion, and contact policy must be published before opening the service to real residents.",
        ],
        [
          "Maps and official services",
          "The map uses OpenStreetMap tiles. Tile requests disclose the viewed map area to that provider. Government links open external services; CivicLens does not file complaints or promise government action.",
        ],
      ].map(([title, body]) => (
        <section key={title}>
          <h2>{title}</h2>
          <p>{body}</p>
        </section>
      ))}
      <p className="notice">
        Hackathon development version. Do not submit sensitive evidence until
        the deployment privacy and retention policy is complete.
      </p>
    </div>
  )
}
type ModerationFlag = {
  id: string
  issue_id: string
  evidence_id: string | null
  reason: string
  title: string
  visibility: "public" | "hidden"
}
function Moderation() {
  const [flags, setFlags] = useState<ModerationFlag[]>([]),
    [error, setError] = useState(""),
    [reason, setReason] = useState(""),
    [notice, setNotice] = useState("")
  const load = () =>
    api<{ flags: ModerationFlag[] }>("/moderation/flags").then((r) =>
      setFlags(r.flags)
    )
  useEffect(() => {
    void load().catch((e) => setError(e.message))
  }, [])
  return (
    <div className="section">
      <div className="page-heading">
        <p className="eyebrow">ADMIN USERS ONLY</p>
        <h1>Content review</h1>
        <p>Visibility changes do not establish issue resolution.</p>
      </div>
      <ErrorText error={error} />
      <Label>
        Reason for your next action
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
        />
      </Label>
      <div className="mt-5 space-y-3">
        {flags.map((f) => (
          <Card key={f.id}>
            <CardContent className="space-y-3 pt-5">
              <h2>{f.title}</h2>
              <p>{f.reason}</p>
              <p className="text-sm text-muted-foreground">
                Current issue visibility: {f.visibility}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  disabled={reason.trim().length < 10}
                  onClick={() =>
                    void api(
                      "/moderation/content/" +
                        (f.evidence_id ? "evidence" : "issue") +
                        "/" +
                        (f.evidence_id ?? f.issue_id),
                      {
                        method: "PATCH",
                        body: JSON.stringify({ visibility: "hidden", reason }),
                      }
                    )
                      .then(() => {
                        setNotice("Content hidden.")
                        return load()
                      })
                      .catch((e) => setError(e.message))
                  }
                >
                  Hide flagged content
                </Button>
                <Button
                  variant="outline"
                  disabled={reason.trim().length < 10}
                  onClick={() =>
                    void api(
                      "/moderation/content/" +
                        (f.evidence_id ? "evidence" : "issue") +
                        "/" +
                        (f.evidence_id ?? f.issue_id),
                      {
                        method: "PATCH",
                        body: JSON.stringify({ visibility: "public", reason }),
                      }
                    )
                      .then(() => {
                        setNotice("Content restored.")
                        return load()
                      })
                      .catch((e) => setError(e.message))
                  }
                >
                  Restore content
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!flags.length && !error && (
        <p className="empty-state">No reports are waiting in the queue.</p>
      )}
      <p role="status">{notice}</p>
    </div>
  )
}
function IssuesLayout() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const { full } = useSearch({ strict: false })
  const exploring = !full && /^\/issues(?:\/[^/]+)?\/?$/.test(pathname)
  // Keep this subtree mounted while child routes change.
  return (
    <>
      <div hidden={!exploring}>
        <Explore />
      </div>
      <Outlet />
    </>
  )
}
function IssueView() {
  const { full } = useSearch({ strict: false })
  const { issueId } = useParams({ strict: false }) as { issueId: string }
  return full ? <Detail key={issueId} /> : <IssuePanel />
}
function IssuePrint() {
  const { issueId } = useParams({ strict: false }) as { issueId: string }
  return <Detail key={issueId} print />
}
function IssuePanel() {
  const { issueId } = useParams({ strict: false }) as { issueId: string }
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const origin = useRef(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  )
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open)
          void navigate({ to: "/issues", replace: true, resetScroll: false })
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="issue-panel-backdrop" />
        <Dialog.Popup
          className={"issue-panel " + (expanded ? "is-expanded" : "")}
          initialFocus={closeRef}
          finalFocus={() =>
            origin.current?.isConnected && origin.current !== document.body
              ? origin.current
              : document.getElementById("explore-heading")
          }
        >
          <div className="issue-panel-handle" aria-hidden="true" />
          <header className="issue-panel-header">
            <Dialog.Title className="issue-panel-title">
              Issue details
            </Dialog.Title>
            <div className="issue-panel-actions">
              <Button
                className="sheet-expand"
                variant="outline"
                aria-expanded={expanded}
                aria-controls="issue-panel-content"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? "Collapse" : "Expand"}
              </Button>
              <Link
                to="/issues/$issueId"
                params={{ issueId }}
                search={{ full: true }}
                resetScroll={false}
                className="text-link"
              >
                Open full page
              </Link>
              <Dialog.Close ref={closeRef} className="panel-close">
                Close<span className="sr-only"> issue details</span>
              </Dialog.Close>
            </div>
          </header>
          <Dialog.Description className="sr-only">
            Review the community evidence. Close to return to the same map or
            list.
          </Dialog.Description>
          <div className="issue-panel-content" id="issue-panel-content">
            <Detail key={issueId} embedded />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
const rootRoute = createRootRoute({
  component: Root,
  notFoundComponent: () => (
    <div className="section">
      <h1>Page not found</h1>
      <Link to="/issues">Explore issues</Link>
    </div>
  ),
})
const issuesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/issues",
  validateSearch: (search: Record<string, unknown>): { full?: boolean } => ({
    full: search.full === true || search.full === "true" ? true : undefined,
  }),
  component: IssuesLayout,
})
const issueRoute = createRoute({
  getParentRoute: () => issuesRoute,
  path: "$issueId",
  component: Outlet,
})
const issueRoutes = issuesRoute.addChildren([
  createRoute({
    getParentRoute: () => issuesRoute,
    path: "/",
    component: () => null,
  }),
  issueRoute.addChildren([
    createRoute({
      getParentRoute: () => issueRoute,
      path: "/",
      component: IssueView,
    }),
    createRoute({
      getParentRoute: () => issueRoute,
      path: "evidence/new",
      component: Editor,
    }),
    createRoute({
      getParentRoute: () => issueRoute,
      path: "print",
      component: IssuePrint,
    }),
  ]),
])
const routes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: Home,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/report/new",
    component: Editor,
  }),
  issueRoutes,
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/sign-in",
    component: AuthPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/sign-up",
    component: () => <AuthPage signup />,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/privacy",
    component: Privacy,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/moderation",
    component: Moderation,
  }),
]
const router = createRouter({
  routeTree: rootRoute.addChildren(routes),
  defaultPreload: "intent",
})
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
export default function App() {
  return <RouterProvider router={router} />
}
