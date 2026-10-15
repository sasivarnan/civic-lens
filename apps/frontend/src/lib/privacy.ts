export class StalePhotoError extends Error {}

// A finished export is valid only for the review that started it.
export function createPrivacyApproval() {
  let revision = 0
  let reviewed = false
  return {
    change() {
      reviewed = false
      revision++
    },
    review(value: boolean) {
      reviewed = value
      revision++
    },
    version() {
      return revision
    },
    isCurrent(version: number) {
      return revision === version
    },
    async export(encode: () => Promise<Blob | null>) {
      if (!reviewed) throw new Error("Review the whole image first.")
      const version = ++revision
      const blob = await encode()
      if (version !== revision || !reviewed) throw new StalePhotoError()
      if (!blob || blob.size === 0 || blob.type !== "image/jpeg")
        throw new Error("Image export failed.")
      return { blob, version }
    },
  }
}
