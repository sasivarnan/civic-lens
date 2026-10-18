import { afterEach, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import type { Issue } from "@civiclens/shared"
import { CaseProgress } from "../src/components/CaseProgress"
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const issue: Issue = {
  id: "8f102b20-6654-4b79-9de6-dc407f302001",
  title: "Demo case",
  description: "Synthetic demo issue.",
  category: "pothole",
  status: "reported",
  latitude: 12.97,
  longitude: 77.59,
  observationDate: "2026-10-18",
  createdAt: "2026-10-18T06:00:00Z",
  demo: true,
  assetId: null,
  supportCount: 0,
  confirmationCount: 0,
  caseRevision: 4,
}
const assigned: Issue = {
  ...issue,
  caseProgress: {
    stage: "assigned",
    authority: "Demo team",
    owner: "Team",
    reference: "",
    sentDate: "",
    sourceUrl: "",
    note: "Demo assignment.",
    updatedAt: "2026-10-18T06:00:00Z",
  },
}
async function open(current = issue, refresh = async () => {}) {
  render(
    <CaseProgress
      issue={current}
      canManage
      ownerName="Demo coordinator"
      onUpdated={refresh}
    />
  )
  expect(screen.queryByRole("dialog")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Manage case" }))
  await screen.findByRole("dialog", { name: "Manage case" })
}
function submit() {
  fireEvent.submit(screen.getByRole("form", { name: "Update case progress" }))
}
it("shows public progress without admin controls", () => {
  render(
    <CaseProgress
      issue={issue}
      canManage={false}
      ownerName=""
      onUpdated={async () => {}}
    />
  )
  expect(screen.getByRole("heading", { name: "Reported" })).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Manage case" })).toBeNull()
  expect(
    screen.getByText(/does not mean an authority has accepted/)
  ).toBeTruthy()
})
it("assigns with only a team name and an automatic owner", async () => {
  const fetch = vi.fn<
    (url: unknown, options: RequestInit) => Promise<Response>
  >(async () => new Response(JSON.stringify({ ok: true })))
  vi.stubGlobal("fetch", fetch)
  const refresh = vi.fn(async () => {})
  await open(issue, refresh)
  fireEvent.change(screen.getByLabelText("Assigned team"), {
    target: { value: "Demo authority" },
  })
  submit()
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toMatchObject({
    stage: "assigned",
    owner: "Demo coordinator",
    revision: 4,
    note: "",
    sourceUrl: "",
  })
})
it("starts work with a note and no complaint reference or date", async () => {
  const fetch = vi.fn<
    (url: unknown, options: RequestInit) => Promise<Response>
  >(async () => new Response(JSON.stringify({ ok: true })))
  vi.stubGlobal("fetch", fetch)
  await open(assigned)
  fireEvent.change(screen.getByLabelText("Update note"), {
    target: { value: "Demo team reports that work has started." },
  })
  submit()
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
  expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toMatchObject({
    stage: "in_progress",
    reference: "",
    sentDate: "",
  })
})
it("permits a direct resolution action but blocks it without later evidence", async () => {
  const fetch = vi.fn()
  vi.stubGlobal("fetch", fetch)
  await open(assigned)
  fireEvent.click(screen.getByRole("button", { name: "Report resolution" }))
  fireEvent.change(screen.getByLabelText("Update note"), {
    target: { value: "Demo repair reported for review." },
  })
  submit()
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("later photo")
  )
  expect(fetch).not.toHaveBeenCalled()
})
it("closes the editor and returns focus to its trigger", async () => {
  await open()
  fireEvent.click(screen.getByRole("button", { name: "Close" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Manage case" })
    )
  )
})
it("keeps entered text when the server rejects an update", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: "This case changed. Refresh and try again.",
          }),
          { status: 409 }
        )
    )
  )
  const refresh = vi.fn(async () => {})
  await open(assigned, refresh)
  fireEvent.change(screen.getByLabelText("Update note"), {
    target: { value: "Demo update for review." },
  })
  submit()
  expect(await screen.findByRole("alert")).toBeTruthy()
  expect(screen.getByRole("dialog", { name: "Manage case" })).toBeTruthy()
  expect(
    (screen.getByLabelText("Update note") as HTMLTextAreaElement).value
  ).toBe("Demo update for review.")
  expect(refresh).not.toHaveBeenCalled()
})

it("keeps an in-progress note update at its current stage without requiring a photo", async () => {
  const fetch = vi.fn<
    (url: unknown, options: RequestInit) => Promise<Response>
  >(async () => new Response(JSON.stringify({ ok: true })))
  vi.stubGlobal("fetch", fetch)
  await open({
    ...assigned,
    caseProgress: { ...assigned.caseProgress!, stage: "in_progress" },
  })
  expect(screen.queryByLabelText("Later photo evidence")).toBeNull()
  fireEvent.change(screen.getByLabelText("Update note"), {
    target: { value: "Demo team reports a further work update." },
  })
  submit()
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
  expect(JSON.parse(fetch.mock.calls[0][1].body as string).stage).toBe(
    "in_progress"
  )
})
it("offers upload and can load and select evidence from earlier history", async () => {
  const photo = {
    id: "8f102b20-6654-4b79-9de6-dc407f302009",
    assetId: "asset-1",
    kind: "evidence",
    observationDate: "2026-10-18",
    createdAt: "2026-10-18T06:00:00Z",
    description: "Demo repair photo.",
  }
  const fetch = vi
    .fn<(url: unknown, options?: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ history: [photo], nextHistoryCursor: null })
      )
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
  vi.stubGlobal("fetch", fetch)
  await open({
    ...assigned,
    nextHistoryCursor: "2026-10-18T06:00:00Z",
  } as Issue)
  fireEvent.click(screen.getByRole("button", { name: "Report resolution" }))
  expect(screen.getByText("Upload evidence")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Load earlier evidence" }))
  await screen.findByRole("option", { name: /Demo repair photo/ })
  fireEvent.change(screen.getByLabelText("Later photo evidence"), {
    target: { value: photo.id },
  })
  fireEvent.change(screen.getByLabelText("Update note"), {
    target: { value: "Demo repair evidence selected for review." },
  })
  submit()
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).toMatchObject({
    stage: "resolution_reported",
    evidenceId: photo.id,
  })
})
