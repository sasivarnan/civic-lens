import { afterEach, expect, it, vi } from "vitest"
import { newId } from "../src/lib/uuid"
afterEach(() => vi.unstubAllGlobals())
it("makes a UUID when randomUUID is unavailable on HTTP", () => {
  vi.stubGlobal("crypto", {
    getRandomValues: (bytes: Uint8Array) => {
      bytes.fill(171)
      return bytes
    },
  })
  expect(newId()).toBe("abababab-abab-4bab-abab-abababababab")
})
it("uses native randomUUID when available", () => {
  const randomUUID = vi.fn(() => "native-id")
  vi.stubGlobal("crypto", { randomUUID })
  expect(newId()).toBe("native-id")
  expect(randomUUID).toHaveBeenCalledOnce()
})
