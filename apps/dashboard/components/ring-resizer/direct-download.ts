// Direct MinIO download links (LAN, skipping the app) are plain http. On an
// https page the browser blocks or flags them as insecure downloads, so they
// are only offered when the page itself is http, or MinIO is served over https.

/** The direct URL when it is safe to use from this page, else null. */
export function safeDirectUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (typeof window !== "undefined" && window.location.protocol === "https:" && url.startsWith("http:")) {
    return null
  }
  return url
}

/**
 * Opaque no-cors probe with a short timeout: is the MinIO host reachable
 * from this browser (operator on LAN)? No CORS needed on MinIO.
 */
export async function probeDirect(url: string): Promise<boolean> {
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 1500)
    await fetch(url, { method: "HEAD", mode: "no-cors", signal: ctl.signal })
    clearTimeout(timer)
    return true
  } catch {
    return false
  }
}
