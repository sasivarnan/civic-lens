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
it("shows public progress without admin controls", () => {
  render(
    <CaseProgress
      issue={issue}
      canManage={false}
      ownerName=""
      onUpdated={async () => {}}
    />
  )
  expect(screen.getByRole("heading", { name: "Not assigned" })).toBeTruthy()
  expect(
    screen.queryByRole("form", { name: "Update case progress" })
  ).toBeNull()
  expect(
    screen.getByText(/does not mean an authority has accepted/)
  ).toBeTruthy()
})
it("saves an admin assignment with the current revision and refreshes the issue", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true })))
  vi.stubGlobal("fetch", fetch)
  const refresh = vi.fn(async () => {})
  render(
    <CaseProgress
      issue={issue}
      canManage
      ownerName="Demo coordinator"
      onUpdated={refresh}
    />
  )
  expect(screen.queryByRole("dialog")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Manage case" }))
  await screen.findByRole("dialog", { name: "Manage case" })
  fireEvent.change(screen.getByLabelText("Authority or service name"), {
    target: { value: "Demo authority" },
  })
  fireEvent.change(screen.getByLabelText("Public source link"), {
    target: { value: "https://example.com/source" },
  })
  fireEvent.change(screen.getByLabelText("Public update and source details"), {
    target: { value: "Demo only. Check the responsible authority." },
  })
  fireEvent.submit(screen.getByRole("form", { name: "Update case progress" }))
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
    stage: "assigned",
    owner: "Demo coordinator",
    revision: 4,
  })
})
it("blocks a sent update without a complaint reference and date", async () => {
  const fetch = vi.fn()
  vi.stubGlobal("fetch", fetch)
  const assigned = {
    ...issue,
    caseProgress: {
      stage: "assigned" as const,
      authority: "Demo authority",
      owner: "Team",
      reference: "",
      sentDate: "",
      sourceUrl: "https://example.com",
      note: "Demo assignment.",
      updatedAt: "2026-10-18T06:00:00Z",
    },
  }
  render(
    <CaseProgress
      issue={assigned}
      canManage
      ownerName=""
      onUpdated={async () => {}}
    />
  )
  fireEvent.click(screen.getByRole("button", { name: "Manage case" }))
  await screen.findByRole("dialog", { name: "Manage case" })
  fireEvent.change(screen.getByLabelText("Next progress stage"), {
    target: { value: "sent" },
  })
  fireEvent.change(screen.getByLabelText("Public update and source details"), {
    target: { value: "Demo handoff test." },
  })
  fireEvent.submit(screen.getByRole("form", { name: "Update case progress" }))
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("handoff date and complaint reference")
  )
  expect(fetch).not.toHaveBeenCalled()
})

it("closes the case editor and returns focus to its trigger", async () => {
  render(
    <CaseProgress
      issue={issue}
      canManage
      ownerName="Team"
      onUpdated={async () => {}}
    />
  )
  const trigger = screen.getByRole("button", { name: "Manage case" })
  trigger.focus()
  fireEvent.click(trigger)
  await screen.findByRole("dialog", { name: "Manage case" })
  fireEvent.click(screen.getByRole("button", { name: "Close" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  await waitFor(() => expect(document.activeElement).toBe(trigger))
})

it("keeps the dialog and entered note when the server rejects an update", async () => {
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
  render(
    <CaseProgress
      issue={issue}
      canManage
      ownerName="Team"
      onUpdated={refresh}
    />
  )
  fireEvent.click(screen.getByRole("button", { name: "Manage case" }))
  await screen.findByRole("dialog", { name: "Manage case" })
  fireEvent.change(screen.getByLabelText("Authority or service name"), {
    target: { value: "Demo authority" },
  })
  fireEvent.change(screen.getByLabelText("Public source link"), {
    target: { value: "https://example.com/source" },
  })
  fireEvent.change(screen.getByLabelText("Public update and source details"), {
    target: { value: "Demo update for review." },
  })
  fireEvent.submit(screen.getByRole("form", { name: "Update case progress" }))
  expect(await screen.findByRole("alert")).toBeTruthy()
  expect(screen.getByRole("dialog", { name: "Manage case" })).toBeTruthy()
  expect(
    (
      screen.getByLabelText(
        "Public update and source details"
      ) as HTMLTextAreaElement
    ).value
  ).toBe("Demo update for review.")
  expect(refresh).not.toHaveBeenCalled()
})
