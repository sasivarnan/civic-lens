import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
const state = vi.hoisted(() => ({
  stage: "not_assigned",
  section: "cases",
  navigate: vi.fn(),
}))
vi.mock("@tanstack/react-router", () => ({
  useSearch: () => state,
  useNavigate: () => state.navigate,
  Link: ({
    to,
    children,
    params,
    search,
    hash,
    ...props
  }: {
    to: string
    children: React.ReactNode
    params?: { issueId: string }
    search?: Record<string, unknown>
    hash?: string
    "aria-label"?: string
  }) => (
    <a
      {...props}
      href={
        to.replace("$issueId", params?.issueId ?? "") +
        (search
          ? "?" +
            new URLSearchParams(
              Object.entries(search).map(([key, value]) => [key, String(value)])
            )
          : "") +
        (hash ? "#" + hash : "")
      }
    >
      {children}
    </a>
  ),
}))
import { AdminWorkspace } from "../src/components/AdminWorkspace"
const item = {
  id: "case-1",
  title: "Demo case for assignment",
  category: "pothole",
  status: "reported",
  demo: true,
  createdAt: "2026-10-18T06:00:00Z",
  caseProgress: null,
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status })
beforeEach(() => {
  state.stage = "not_assigned"
  state.section = "cases"
  state.navigate.mockClear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it("shows the case queue with an assignment action and direct case link", async () => {
  const fetch = vi.fn(async () => json({ cases: [item], nextCursor: null }))
  vi.stubGlobal("fetch", fetch)
  render(<AdminWorkspace contentReview={<p>Flag review panel</p>} />)
  await screen.findByRole("heading", { name: item.title })
  expect(
    screen
      .getByRole("link", { name: "Open case: " + item.title })
      .getAttribute("href")
  ).toBe("/issues/case-1?full=true#case-progress")
  expect(fetch.mock.calls[0][0]).toBe(
    "/api/moderation/cases?stage=not_assigned"
  )
  fireEvent.change(screen.getByLabelText("Case stage"), {
    target: { value: "in_progress" },
  })
  expect(state.navigate).toHaveBeenCalledWith({
    to: "/moderation",
    search: { section: "cases", stage: "in_progress" },
  })
})
it("keeps loading, failed, and empty results separate and permits refresh", async () => {
  let finish!: (response: Response) => void
  const fetch = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        })
    )
    .mockResolvedValueOnce(json({ cases: [], nextCursor: null }))
  vi.stubGlobal("fetch", fetch)
  render(<AdminWorkspace contentReview={null} />)
  expect(screen.getByText("Loading cases…")).toBeTruthy()
  expect(screen.queryByText(/No cases at this stage/)).toBeNull()
  finish(json({ error: "The service is unavailable." }, 503))
  await screen.findByRole("alert")
  expect(screen.queryByText(/No cases at this stage/)).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Refresh queue" }))
  await screen.findByText(/No cases at this stage/)
})
it("loads another page without duplicate rows", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(json({ cases: [item], nextCursor: "page-2" }))
    .mockResolvedValueOnce(
      json({
        cases: [item, { ...item, id: "case-2", title: "Second demo case" }],
        nextCursor: null,
      })
    )
  vi.stubGlobal("fetch", fetch)
  render(<AdminWorkspace contentReview={null} />)
  fireEvent.click(
    await screen.findByRole("button", { name: "Load more cases" })
  )
  await screen.findByRole("heading", { name: "Second demo case" })
  expect(screen.getAllByRole("heading", { name: item.title })).toHaveLength(1)
  expect(fetch.mock.calls[1][0]).toContain("cursor=page-2")
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Load more cases" })).toBeNull()
  )
})
it("opens content review without a case query", () => {
  state.section = "content"
  const fetch = vi.fn()
  vi.stubGlobal("fetch", fetch)
  render(<AdminWorkspace contentReview={<p>Flag review panel</p>} />)
  expect(screen.getByText("Flag review panel")).toBeTruthy()
  expect(screen.queryByLabelText("Case stage")).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})
