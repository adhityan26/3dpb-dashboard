export function waEnabled(): boolean {
  return !!(process.env.WA_OMNI_URL && process.env.WA_OMNI_TOKEN && process.env.WA_OMNI_ACCOUNT_ID);
}

/** Kirim pesan WA via WA Omni. Throw bila env absen / non-2xx / timeout. */
export async function sendWA(phone: string, body: string): Promise<void> {
  const url = process.env.WA_OMNI_URL;
  const token = process.env.WA_OMNI_TOKEN;
  const accountId = process.env.WA_OMNI_ACCOUNT_ID;
  if (!url || !token || !accountId) throw new Error("WA_OMNI env belum lengkap");
  const res = await fetch(`${url}/api/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ phone, body, account_id: Number(accountId) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`WA Omni send gagal: HTTP ${res.status}`);
}
