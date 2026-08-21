import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/wa/normalize";
import { waEnabled, sendWA } from "@/lib/wa/client";
import { canSend, issueOtp } from "@/lib/wa/otp";
import { canSendFromIp, recordIpSent, canSendGlobal, recordGlobalSent, getClientIp } from "@/lib/wa/abuse-guard";

export async function POST(req: Request) {
  if (!waEnabled()) return NextResponse.json({ error: "wa_disabled" }, { status: 503 });

  // Circuit-breaker global dicek PALING DULU (sebelum baca body/IP pun) -- kalau sistem
  // lagi disalahgunakan, tolak secepat mungkin tanpa kerja tambahan apa pun.
  const globalGate = await canSendGlobal();
  if (!globalGate.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const ip = getClientIp(req);
  const ipGate = await canSendFromIp(ip);
  if (!ipGate.ok) return NextResponse.json({ error: "rate_limited", waitSec: ipGate.waitSec }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(String(body?.input ?? ""));
  if (!phone) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  const gate = await canSend(phone);
  if (!gate.ok) return NextResponse.json({ error: "rate_limited", waitSec: gate.waitSec }, { status: 429 });
  const { code } = await issueOtp(phone);
  // Catat IP+global SEBELUM kirim, bukan sesudah -- percobaan kirim (bahkan yang gagal di
  // sendWA) tetap membebani kuota/reputasi akun WA Omni-mu, jadi tetap harus dihitung
  // buat proteksi abuse, bukan cuma yang sukses.
  await recordIpSent(ip);
  await recordGlobalSent();
  try {
    await sendWA(phone, `Kode masuk Slizebiz: ${code}. Berlaku 10 menit, jangan dibagikan.`);
  } catch {
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
