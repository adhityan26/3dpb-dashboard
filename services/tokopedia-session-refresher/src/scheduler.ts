export function shouldRefresh(tokenExpiryMs: number | null, nowMs: number, thresholdHours: number): boolean {
  if (tokenExpiryMs == null) return true
  const thresholdMs = thresholdHours * 60 * 60 * 1000
  return tokenExpiryMs - nowMs <= thresholdMs
}
