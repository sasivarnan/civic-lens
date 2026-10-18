// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost:5173/report/new"}
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { fireEvent, screen, waitFor } from "@testing-library/dom"
vi.mock("../src/components/Map", () => ({ default: () => <div>Test map</div> }))
vi.mock("exifr", () => ({
  default: {
    gps: vi.fn(async (file: File) =>
      file.name === "gps.jpg"
        ? { latitude: 12.9716, longitude: 77.5946 }
        : undefined
    ),
  },
}))
const NativeURL = URL
const photo = (name: string, size = 20) =>
  new File([new Uint8Array(size)], name, { type: "image/jpeg" })
beforeEach(() => {
  window.history.replaceState(null, "", "/report/new")
  vi.spyOn(window, "scrollTo").mockImplementation(() => {})
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ user: { id: "test-member", role: "member" } }),
          { headers: { "Content-Type": "application/json" } }
        )
    )
  )
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async (file: File) => {
      if (file.name === "corrupt.jpg") throw new Error("Invalid image")
      return { width: 800, height: 600, close: vi.fn() }
    })
  )
  vi.stubGlobal(
    "URL",
    class extends NativeURL {
      static createObjectURL() {
        return "blob:synthetic-test"
      }
      static revokeObjectURL() {}
    }
  )
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback) =>
      callback(new Blob(["encoded test pixels"], { type: "image/jpeg" }))
  )
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function openEditor() {
  const { default: App } = await import("../src/App")
  render(<App />)
  await screen.findByRole("heading", { name: "Report an issue", exact: true })
}
async function choose(file: File) {
  fireEvent.change(screen.getByLabelText("Select a still photo"), {
    target: { files: [file] },
  })
}
async function approve() {
  const review = await screen.findByRole("checkbox", {
    name: /I checked the whole image/,
  })
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Add manual cover",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  )
  fireEvent.click(review)
  fireEvent.click(
    screen.getByRole("button", { name: "Create approved upload image" })
  )
  await screen.findByRole("img", { name: "Exact privacy-edited upload copy" })
}
it("clears photo GPS, review, and approved output when the photo is replaced", async () => {
  await openEditor()
  await choose(photo("gps.jpg"))
  fireEvent.click(
    await screen.findByRole("button", { name: "Use photo location" })
  )
  fireEvent.click(
    screen.getByRole("checkbox", { name: /I checked this incident point/ })
  )
  fireEvent.change(screen.getByLabelText("What did you observe?"), {
    target: { value: "Synthetic barrier test; no real incident." },
  })
  await approve()
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Review evidence",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  )
  await choose(photo("no-gps.jpg"))
  await waitFor(() =>
    expect((screen.getByLabelText("Latitude") as HTMLInputElement).value).toBe(
      ""
    )
  )
  expect((screen.getByLabelText("Longitude") as HTMLInputElement).value).toBe(
    ""
  )
  expect(
    screen.queryByRole("button", { name: "Use photo location" })
  ).toBeNull()
  expect(
    screen.queryByRole("img", { name: "Exact privacy-edited upload copy" })
  ).toBeNull()
  expect(
    (
      screen.getByRole("checkbox", {
        name: /I checked this incident point/,
      }) as HTMLInputElement
    ).checked
  ).toBe(false)
  expect(
    (
      screen.getByRole("button", {
        name: "Review evidence",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true)
})
it("retains a manually selected point but requires new location confirmation", async () => {
  await openEditor()
  await choose(photo("no-gps.jpg"))
  fireEvent.change(screen.getByLabelText("Latitude"), {
    target: { value: "12.9716" },
  })
  fireEvent.change(screen.getByLabelText("Longitude"), {
    target: { value: "77.5946" },
  })
  fireEvent.click(
    screen.getByRole("checkbox", { name: /I checked this incident point/ })
  )
  await choose(photo("replacement.jpg"))
  expect((screen.getByLabelText("Latitude") as HTMLInputElement).value).toBe(
    "12.9716"
  )
  expect((screen.getByLabelText("Longitude") as HTMLInputElement).value).toBe(
    "77.5946"
  )
  expect(
    (
      screen.getByRole("checkbox", {
        name: /I checked this incident point/,
      }) as HTMLInputElement
    ).checked
  ).toBe(false)
})
it("removes previous approval when an oversized replacement is rejected", async () => {
  await openEditor()
  await choose(photo("no-gps.jpg"))
  await approve()
  await choose(photo("oversized.jpg", 8 * 1024 * 1024 + 1))
  await screen.findByText("Select an image smaller than 8 MB.")
  expect(
    screen.queryByRole("img", { name: "Exact privacy-edited upload copy" })
  ).toBeNull()
  expect(
    screen.queryByRole("button", { name: "Create approved upload image" })
  ).toBeNull()
})
it("blocks corrupt image approval without an AI request", async () => {
  await openEditor()
  await choose(photo("corrupt.jpg"))
  await screen.findByText("Cannot open this image. Select another photo.")
  expect(
    (
      screen.getByRole("button", {
        name: "Create approved upload image",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true)
  expect(
    (
      screen.getByRole("button", {
        name: "Review evidence",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true)
  const calls = vi.mocked(fetch).mock.calls
  expect(calls.every(([url]) => String(url).endsWith("/auth/session"))).toBe(
    true
  )
})
it("blocks publication after insufficient evidence and allows a new review", async () => {
  const analysis = {
    evidenceStatus: "insufficient",
    category: null,
    observations: ["The image is blank."],
    claims: [],
    conflicts: [],
    unknowns: ["No road context is visible."],
    nextEvidence: "Select a road photo.",
  }
  let sufficient = false
  vi.mocked(fetch).mockImplementation(
    async (url) =>
      new Response(
        JSON.stringify(
          String(url).endsWith("/analyses")
            ? {
                analysis: sufficient
                  ? {
                      ...analysis,
                      evidenceStatus: "sufficient",
                      category: "pothole",
                    }
                  : analysis,
                receipt: sufficient ? "new-receipt" : "",
                model: "test",
              }
            : { user: { id: "test-member", role: "member" } }
        ),
        { headers: { "Content-Type": "application/json" } }
      )
  )
  await openEditor()
  await choose(photo("gps.jpg"))
  fireEvent.click(
    await screen.findByRole("button", { name: "Use photo location" })
  )
  fireEvent.click(
    screen.getByRole("checkbox", { name: /I checked this incident point/ })
  )
  fireEvent.change(screen.getByLabelText("What did you observe?"), {
    target: { value: "Synthetic evidence review test." },
  })
  await approve()
  fireEvent.click(screen.getByRole("button", { name: "Review evidence" }))
  await screen.findByText("Insufficient evidence")
  expect(screen.queryByRole("button", { name: /Publish/ })).toBeNull()
  expect(screen.queryByLabelText("Reviewed category")).toBeNull()
  expect(
    vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/issues"))
  ).toBe(false)
  sufficient = true
  await choose(photo("replacement.jpg"))
  fireEvent.change(screen.getByLabelText("Latitude"), {
    target: { value: "12.9716" },
  })
  fireEvent.change(screen.getByLabelText("Longitude"), {
    target: { value: "77.5946" },
  })
  fireEvent.click(
    screen.getByRole("checkbox", { name: /I checked this incident point/ })
  )
  await approve()
  fireEvent.click(screen.getByRole("button", { name: "Review evidence" }))
  await screen.findByLabelText("Reviewed category")
  expect(screen.queryByText("Insufficient evidence")).toBeNull()
})
it("keeps the approved photo and description after a failed AI request", async () => {
  vi.mocked(fetch).mockImplementation(
    async (url) =>
      new Response(
        JSON.stringify(
          String(url).endsWith("/analyses")
            ? {
                error:
                  "The AI service is unavailable. Your form is still on this device.",
              }
            : { user: { id: "test-member", role: "member" } }
        ),
        {
          status: String(url).endsWith("/analyses") ? 503 : 200,
          headers: { "Content-Type": "application/json" },
        }
      )
  )
  await openEditor()
  await choose(photo("gps.jpg"))
  fireEvent.click(
    await screen.findByRole("button", { name: "Use photo location" })
  )
  fireEvent.click(
    screen.getByRole("checkbox", { name: /I checked this incident point/ })
  )
  fireEvent.change(screen.getByLabelText("What did you observe?"), {
    target: { value: "Synthetic road evidence test." },
  })
  await approve()
  fireEvent.click(screen.getByRole("button", { name: "Review evidence" }))
  await screen.findByRole("alert")
  expect(
    (screen.getByLabelText("What did you observe?") as HTMLTextAreaElement)
      .value
  ).toBe("Synthetic road evidence test.")
  expect(
    screen.getByRole("img", { name: "Exact privacy-edited upload copy" })
  ).toBeTruthy()
  expect(
    (
      screen.getByRole("button", {
        name: "Review evidence",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(false)
  expect(screen.queryByRole("button", { name: "Publish issue" })).toBeNull()
})
