// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost:5173/sign-in?error=Verification"}
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { screen } from "@testing-library/dom"
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it("lets a signed-in member continue after an already-used email link", async () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {})
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ user: { id: "test-member", role: "member" } })
        )
    )
  )
  const { default: App } = await import("../src/App")
  render(<App />)
  await screen.findByRole("heading", { name: "Already signed in" })
  expect(
    screen
      .getByRole("link", { name: "Continue to reporting" })
      .getAttribute("href")
  ).toBe("/report/new")
  expect(screen.queryByLabelText("Email address")).toBeNull()
  expect(
    screen.queryByText("Sign-in was not completed. Request a new link.")
  ).toBeNull()
})
it("shows the demo notice and keeps email sign-in available for admins", async () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {})
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    demoMode: true, user: { id: "demo-visitor", demo: true, role: "member" },
  }))))
  const { default: App } = await import("../src/App")
  render(<App />)
  await screen.findByText(/Hackathon demo. No email sign-in is needed/)
  expect(screen.getByLabelText("Email address")).toBeTruthy()
  expect(screen.getByText("Demo visitor")).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull()
  expect(screen.queryByText("Already signed in")).toBeNull()
})
