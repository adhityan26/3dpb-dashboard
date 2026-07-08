/**
 * Build a Sanity CDN image URL from an asset _ref.
 * The _ref format is: image-{hash}-{WxH}-{ext}
 * CDN URL:            https://cdn.sanity.io/images/{projectId}/{dataset}/{hash}-{WxH}.{ext}
 *
 * The project ID is not secret — it's embedded in every CDN URL anyway.
 */
const PROJECT_ID = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "narxcnnu"
const DATASET = process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production"

export function sanityImageUrl(ref: string, widthPx?: number): string {
  // ref: "image-abc123-800x600-jpg"
  const withoutPrefix = ref.replace(/^image-/, "")
  // withoutPrefix: "abc123-800x600-jpg"
  const lastDash = withoutPrefix.lastIndexOf("-")
  const ext = withoutPrefix.slice(lastDash + 1)
  const body = withoutPrefix.slice(0, lastDash)
  // body: "abc123-800x600"
  const url = `https://cdn.sanity.io/images/${PROJECT_ID}/${DATASET}/${body}.${ext}`
  return widthPx ? `${url}?w=${widthPx}&fit=max` : url
}
