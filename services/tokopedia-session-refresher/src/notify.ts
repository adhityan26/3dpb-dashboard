export function shouldNotify(lastNotifiedAtMs: number | null, nowMs: number, cooldownHours: number): boolean {
  if (lastNotifiedAtMs == null) return true
  const cooldownMs = cooldownHours * 60 * 60 * 1000
  return nowMs - lastNotifiedAtMs > cooldownMs
}

export async function sendFailureNotification(
  cfg: { waOmniEndpoint: string; waOmniToken: string; waOmniTargetNumber: string },
  message: string,
): Promise<void> {
  const res = await fetch(`${cfg.waOmniEndpoint}/api/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.waOmniToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone: cfg.waOmniTargetNumber, body: message }),
  })

  if (!res.ok) throw new Error(`wa-omni send gagal: HTTP ${res.status}`)
}
