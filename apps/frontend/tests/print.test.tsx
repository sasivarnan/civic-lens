// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost:5173/issues/fixture/print"}
import { afterEach, expect, it, vi } from "vitest"
import { render, cleanup, act } from "@testing-library/react"
import { screen, fireEvent, waitFor } from "@testing-library/dom"
import { guides, type Issue } from "@civiclens/shared"
vi.mock("../src/components/Map", () => ({ default: () => <div>Test map</div> }))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
it("loads all public history before print and includes evidence, location, AI, and source", async () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {})
  const print = vi.spyOn(window, "print").mockImplementation(() => {})
  const issue: Issue = {
    id: "fixture",
    title: "Synthetic print report",
    description: "Synthetic test; no real incident.",
    category: "accessibility",
    status: "reported",
    latitude: 12.9716,
    longitude: 77.5946,
    observationDate: "2026-10-15",
    createdAt: "2026-10-15T10:00:00Z",
    demo: true,
    assetId: "approved-fixture",
    supportCount: 2,
    confirmationCount: 1,
    analysis: {
      evidenceStatus: "sufficient",
      category: "accessibility",
      observations: ["Image 1: test pixels."],
      claims: [],
      conflicts: [],
      unknowns: ["Synthetic evidence only."],
      nextEvidence: "Provide real reviewed evidence.",
    },
    caseProgress: {
      stage: "assigned",
      authority: "Demo accessibility team",
      owner: "Demo coordinator",
      reference: "DEMO-001",
      sentDate: "2026-10-18",
      sourceUrl: "https://example.com/demo",
      note: "Demo only. No authority was contacted.",
      updatedAt: "2026-10-18T06:00:00Z",
    },
    guide: guides.accessibility,
    history: [
      {
        id: "latest",
        description: "Latest public evidence",
        observationDate: "2026-10-15",
        createdAt: "2026-10-15T11:00:00Z",
        assetId: null,
        analysis: null,
        kind: "evidence",
      },
    ],
  }
  let finishEarlier!: (response: Response) => void
  const earlier = new Promise<Response>((resolve) => {
    finishEarlier = resolve
  })
  const json = (data: unknown) =>
    new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    })
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(String(input), "http://localhost:5173")
      if (url.pathname.endsWith("/auth/session")) return json({})
      if (url.pathname === "/api/issues")
        return json({ issues: [], nextCursor: null })
      if (url.searchParams.has("historyCursor")) return earlier
      return json({ ...issue, nextHistoryCursor: "2026-10-15T10:00:00Z" })
    })
  )
  const { default: App } = await import("../src/App")
  render(<App />)
  await screen.findByText("Loading…")
  expect(
    screen.queryByRole("button", { name: "Print / Save as PDF" })
  ).toBeNull()
  await act(async () =>
    finishEarlier(
      json({
        ...issue,
        history: [
          {
            id: "earliest",
            description: "Earlier public evidence",
            observationDate: "2026-10-14",
            createdAt: "2026-10-14T11:00:00Z",
            assetId: "earlier-fixture",
            analysis: null,
            kind: "evidence",
          },
        ],
        nextHistoryCursor: null,
      })
    )
  )
  const button = await screen.findByRole("button", {
    name: "Print / Save as PDF",
  })
  expect(screen.getByText("Latest public evidence")).toBeTruthy()
  expect(screen.getByRole("heading", { name: "Case progress" })).toBeTruthy()
  expect(screen.getByText(/Authority: Demo accessibility team/)).toBeTruthy()
  expect(screen.getByText(/Reference: DEMO-001/)).toBeTruthy()
  expect(screen.getByText("Earlier public evidence")).toBeTruthy()
  expect(screen.getByText("Synthetic evidence only.")).toBeTruthy()
  expect(screen.getByText(/12.971600/)).toBeTruthy()
  expect(
    screen.getByRole("img", { name: issue.title }).getAttribute("src")
  ).toBe("/api/assets/approved-fixture")
  expect(
    screen
      .getByRole("link", { name: "Open official source" })
      .getAttribute("href")
  ).toBe(guides.accessibility.source)
  fireEvent.click(button)
  await waitFor(() => expect(print).toHaveBeenCalledOnce())
  const images = screen.getAllByRole("img") as HTMLImageElement[]
  images.forEach((image) => {
    image.decode = vi.fn().mockRejectedValue(new Error("Image unavailable"))
  })
  fireEvent.click(button)
  await screen.findByRole("alert")
  expect(print).toHaveBeenCalledOnce()
  let completeImages!: () => void
  const decoding = new Promise<void>((resolve) => {
    completeImages = resolve
  })
  images.forEach((image) => {
    image.decode = vi.fn(() => decoding)
  })
  fireEvent.click(button)
  expect(print).toHaveBeenCalledOnce()
  await act(async () => completeImages())
  await waitFor(() => expect(print).toHaveBeenCalledTimes(2))
  expect(screen.getByText("Report ID: fixture")).toBeTruthy()
  expect(
    screen.getByRole("article", { name: "Community evidence report" })
  ).toBeTruthy()
  expect(screen.getByText(guides.accessibility.source)).toBeTruthy()
})
