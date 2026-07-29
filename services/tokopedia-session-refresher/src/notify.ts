export function shouldNotify(lastNotifiedAtMs: number | null, nowMs: number, cooldownHours: number): boolean {
  if (lastNotifiedAtMs == null) return true
  const cooldownMs = cooldownHours * 60 * 60 * 1000
  return nowMs - lastNotifiedAtMs > cooldownMs
}

export async function sendFailureNotification(
  cfg: { waOmniEndpoint: string; waOmniToken: string; waOmniTargetNumber: string; waOmniAccountId: number },
  message: string,
): Promise<void> {
  // account_id WAJIB diisi eksplisit — wa-omni punya beberapa akun WA terhubung
  // (CS Utama, nomor pribadi, dst), dan tanpa account_id server diam-diam memilih
  // akun mana pun yang sedang "connected" sebagai pengirim (insiden nyata: notifikasi
  // terkirim dari nomor yang salah karena itu satu-satunya akun yang online saat itu).
  const res = await fetch(`${cfg.waOmniEndpoint}/api/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.waOmniToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone: cfg.waOmniTargetNumber, body: message, account_id: cfg.waOmniAccountId }),
  })

  if (!res.ok) throw new Error(`wa-omni send gagal: HTTP ${res.status}`)
}
