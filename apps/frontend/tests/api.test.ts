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
it("starts one demo session for concurrent page mounts", async () => {
  const { loadSession } = await import("../src/lib/api")
  const demo = { demoMode: true, user: { id: "demo-a", demo: true, role: "member" } }
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ demoMode: true })))
    .mockResolvedValueOnce(new Response(JSON.stringify(demo)))
  vi.stubGlobal("fetch", fetch)
  expect(await Promise.all([loadSession(), loadSession()])).toEqual([demo, demo])
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls[1][0]).toBe("/api/demo-session")
  expect(fetch.mock.calls[1][1].method).toBe("POST")
})
it("keeps normal email sessions without creating a demo account", async () => {
  const { loadSession } = await import("../src/lib/api")
  const session = { user: { id: "real-member" } }
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(session)))
  vi.stubGlobal("fetch", fetch)
  expect(await loadSession()).toEqual(session)
  expect(fetch).toHaveBeenCalledTimes(1)
})
