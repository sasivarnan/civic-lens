import { afterEach, expect, it, vi } from "vitest"
import { api } from "../src/lib/api"
afterEach(() => vi.unstubAllGlobals())
it("gives a useful connection error without exposing transport details", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Private network detail")
    })
  )
  await expect(api("/issues")).rejects.toThrow(
    "Cannot reach CivicLens. Check your connection and try again. Your unfinished form is still on this device."
  )
})
it.each([200, 502])(
  "rejects an unreadable HTTP %s response",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>Proxy error</html>", { status }))
    )
    await expect(api("/issues")).rejects.toThrow(
      "CivicLens returned an unreadable response. Please try again."
    )
  }
)
it("does not report that a sign-in link was sent after an unreadable response", async () => {
  const { sendEmailLink } = await import("../src/lib/api")
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: "test-token" }))
      )
      .mockResolvedValueOnce(new Response("<html>Proxy error</html>"))
  )
  await expect(sendEmailLink("reporter@civiclens.test")).rejects.toThrow(
    "unreadable response"
  )
})
it("reports a failed sign-out before leaving the page", async () => {
  const { signOut } = await import("../src/lib/api")
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: "test-token" }))
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: "Sign-out failed. Please try again." }),
          { status: 503 }
        )
      )
  )
  await expect(signOut()).rejects.toThrow("Sign-out failed. Please try again.")
})
