import { sendWA } from "@/lib/wa/client";

const MSG_BELI = "Pembayaran terverifikasi — akun Slizebiz kamu sudah aktif 🎉 Terima kasih!";

type ActivatedPayment = { productType: string; quantity: number | null };

function messageFor(payment: ActivatedPayment): string {
  if (payment.productType === "SLOT_PURCHASE") {
    return `Pembayaran terverifikasi — kapasitas monitoring printer kamu bertambah ${payment.quantity} slot 🎉 Terima kasih!`;
  }
  if (payment.productType === "CYD_PURCHASE") {
    return `Pembayaran terverifikasi — kapasitas monitoring printer kamu sudah bertambah sekarang. CYD kamu akan segera dikirim ke alamat yang kamu daftarkan. Terima kasih! 🎉`;
  }
  return MSG_BELI;
}

function subjectFor(payment: ActivatedPayment): string {
  if (payment.productType === "SLOT_PURCHASE") return "Slot printer bertambah";
  if (payment.productType === "CYD_PURCHASE") return "Pembayaran CYD terverifikasi";
  return "Akun Slizebiz aktif";
}

async function sendEmail(to: string, msg: string, subject: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("resend env absent");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text: msg }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`resend HTTP ${res.status}`);
}

/** Best-effort: kabari user aktivasi via channel-nya, pesan disesuaikan productType. Tak pernah throw. */
export async function notifyActivated(user: { phone: string | null; email: string | null }, payment: ActivatedPayment): Promise<void> {
  const msg = messageFor(payment);
  try {
    if (user.phone) await sendWA(user.phone, msg);
    else if (user.email) await sendEmail(user.email, msg, subjectFor(payment));
  } catch (e) {
    console.error("[notify] gagal kirim notif aktivasi:", (e as Error).message);
  }
}
