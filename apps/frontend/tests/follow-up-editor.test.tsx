import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { FollowUpEditor } from "../src/components/FollowUpEditor"
const state = vi.hoisted(() => ({ navigate: vi.fn() }))
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => state.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock("../src/components/PrivacyEditor", () => ({
  PrivacyEditor: ({
    onApprove,
    onEdit,
  }: {
    onApprove: (file: File) => void
    onEdit: () => void
  }) => (
    <>
      <button
        onClick={() =>
          onApprove(
            new File(["approved pixels"], "approved.jpg", {
              type: "image/jpeg",
            })
          )
        }
      >
        Approve test photo
      </button>
      <button onClick={onEdit}>Edit cover</button>
    </>
  ),
}))
const issue = {
  id: "8f102b20-6654-4b79-9de6-dc407f302001",
  title: "Existing ramp report",
  latitude: 12.97,
  longitude: 77.59,
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status })
beforeEach(() => {
  state.navigate.mockReset()
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json(issue))
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
async function open() {
  render(<FollowUpEditor issueId={issue.id} signedIn />)
  await screen.findByText(issue.title)
}
function choose() {
  fireEvent.change(screen.getByLabelText("Choose photo"), {
    target: {
      files: [
        new File(["private original"], "original.jpg", { type: "image/jpeg" }),
      ],
    },
  })
}
function consent() {
  fireEvent.click(
    screen.getByRole("checkbox", { name: /I approve this photo and date/ })
  )
}
it("uses the existing issue context and requires no location, title, or description input", async () => {
  await open()
  expect(screen.queryByLabelText("Latitude")).toBeNull()
  expect(screen.queryByLabelText("Short title")).toBeNull()
  expect(screen.queryByLabelText("What did you observe?")).toBeNull()
  expect(
    screen.getByRole("button", { name: "Publish later evidence" })
  ).toHaveProperty("disabled", true)
})
it("publishes only the approved photo and date without an AI call", async () => {
  const fetch = vi.fn<
    (url: unknown, options?: RequestInit) => Promise<Response>
  >(async (...args) =>
    json(args[1]?.method === "POST" ? { id: issue.id } : issue)
  )
  vi.stubGlobal("fetch", fetch)
  await open()
  choose()
  fireEvent.click(screen.getByRole("button", { name: "Approve test photo" }))
  consent()
  fireEvent.click(
    screen.getByRole("button", { name: "Publish later evidence" })
  )
  await waitFor(() => expect(state.navigate).toHaveBeenCalledOnce())
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls[1][0]).toBe("/api/issues/" + issue.id + "/evidence")
  const body = fetch.mock.calls[1][1]!.body as FormData
  expect((body.get("image") as File).name).toBe("approved.jpg")
  expect(body.has("report")).toBe(false)
  expect(JSON.parse(String(body.get("evidence")))).toMatchObject({
    imageApproved: true,
    finalApproved: true,
    note: "",
  })
})
it("withdraws publication approval after the photo cover changes", async () => {
  await open()
  choose()
  fireEvent.click(screen.getByRole("button", { name: "Approve test photo" }))
  consent()
  fireEvent.click(screen.getByRole("button", { name: "Edit cover" }))
  expect(
    screen.getByRole("button", { name: "Publish later evidence" })
  ).toHaveProperty("disabled", true)
  expect(
    screen.getByRole("checkbox", { name: /I approve this photo and date/ })
  ).toHaveProperty("checked", false)
})
it("keeps the approved photo and request key after a failed upload", async () => {
  const fetch = vi
    .fn<(url: unknown, options?: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(json(issue))
    .mockResolvedValueOnce(json({ error: "Storage unavailable." }, 503))
    .mockResolvedValueOnce(json({ id: issue.id }))
  vi.stubGlobal("fetch", fetch)
  await open()
  choose()
  fireEvent.click(screen.getByRole("button", { name: "Approve test photo" }))
  consent()
  fireEvent.click(
    screen.getByRole("button", { name: "Publish later evidence" })
  )
  await screen.findByRole("alert")
  fireEvent.click(
    screen.getByRole("button", { name: "Publish later evidence" })
  )
  await waitFor(() => expect(state.navigate).toHaveBeenCalledOnce())
  expect(
    (fetch.mock.calls[1][1]!.headers as Record<string, string>)[
      "Idempotency-Key"
    ]
  ).toBe(
    (fetch.mock.calls[2][1]!.headers as Record<string, string>)[
      "Idempotency-Key"
    ]
  )
})
