import { sendWA } from "@/lib/wa/client";

const MSG = "Pembayaran terverifikasi — akun Slizebiz kamu sudah aktif 🎉 Terima kasih!";

async function sendEmail(to: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("resend env absent");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: "Akun Slizebiz aktif", text: MSG }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`resend HTTP ${res.status}`);
}

/** Best-effort: kabari user aktivasi via channel-nya. Tak pernah throw. */
export async function notifyActivated(user: { phone: string | null; email: string | null }): Promise<void> {
  try {
    if (user.phone) await sendWA(user.phone, MSG);
    else if (user.email) await sendEmail(user.email);
  } catch (e) {
    console.error("[notify] gagal kirim notif aktivasi:", (e as Error).message);
  }
}
