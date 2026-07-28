export function shouldNotify(lastNotifiedAtMs: number | null, nowMs: number, cooldownHours: number): boolean {
  if (lastNotifiedAtMs == null) return true
  const cooldownMs = cooldownHours * 60 * 60 * 1000
  return nowMs - lastNotifiedAtMs > cooldownMs
}
