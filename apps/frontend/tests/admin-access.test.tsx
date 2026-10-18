// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost:5173/moderation"}
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it("does not fetch admin data for a demo visitor", async () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {})
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          demoMode: true,
          user: { id: "demo-user", role: "member", demo: true },
        })
      )
  )
  vi.stubGlobal("fetch", fetch)
  const { default: App } = await import("../src/App")
  render(<App />)
  await screen.findByRole("heading", { name: "Admin access is required" })
  expect(screen.queryByRole("heading", { name: "Admin workspace" })).toBeNull()
  expect(
    fetch.mock.calls.some(([path]) => String(path).includes("/moderation/"))
  ).toBe(false)
})
