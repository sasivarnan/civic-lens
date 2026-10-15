import { describe, expect, it } from "vitest"
import { createPrivacyApproval, StalePhotoError } from "../src/lib/privacy"
const jpeg = () => new Blob(["encoded test pixels"], { type: "image/jpeg" })
describe("privacy approval during asynchronous export", () => {
  it("blocks export before review and after review is withdrawn", async () => {
    const approval = createPrivacyApproval()
    await expect(approval.export(async () => jpeg())).rejects.toThrow("Review")
    approval.review(true)
    await approval.export(async () => jpeg())
    approval.review(false)
    await expect(approval.export(async () => jpeg())).rejects.toThrow("Review")
  })
  it("discards pending output after the source or covers change", async () => {
    const approval = createPrivacyApproval()
    approval.review(true)
    let finish!: (blob: Blob) => void
    const pending = approval.export(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    approval.change()
    finish(jpeg())
    await expect(pending).rejects.toBeInstanceOf(StalePhotoError)
  })
  it("discards a pending export when the checkbox is cleared", async () => {
    const approval = createPrivacyApproval()
    approval.review(true)
    let finish!: (blob: Blob) => void
    const pending = approval.export(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    approval.review(false)
    finish(jpeg())
    await expect(pending).rejects.toBeInstanceOf(StalePhotoError)
  })
  it("keeps a newer export when an older export finishes later", async () => {
    const approval = createPrivacyApproval()
    approval.review(true)
    let finish!: (blob: Blob) => void
    const old = approval.export(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const current = await approval.export(async () => jpeg())
    finish(jpeg())
    await expect(old).rejects.toBeInstanceOf(StalePhotoError)
    expect(approval.isCurrent(current.version)).toBe(true)
  })
  it.each([
    null,
    new Blob([], { type: "image/jpeg" }),
    new Blob(["fallback"], { type: "image/png" }),
  ])("blocks missing, empty, or unexpected output", async (result) => {
    const approval = createPrivacyApproval()
    approval.review(true)
    await expect(approval.export(async () => result)).rejects.toThrow(
      "export failed"
    )
  })
  it("propagates encoder failure without returning a file", async () => {
    const approval = createPrivacyApproval()
    approval.review(true)
    await expect(
      approval.export(async () => {
        throw new Error("Canvas unavailable")
      })
    ).rejects.toThrow("Canvas unavailable")
  })
})
