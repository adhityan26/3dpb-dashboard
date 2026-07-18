import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/wa/normalize";
import { waEnabled, sendWA } from "@/lib/wa/client";
import { canSend, issueOtp } from "@/lib/wa/otp";

export async function POST(req: Request) {
  if (!waEnabled()) return NextResponse.json({ error: "wa_disabled" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(String(body?.input ?? ""));
  if (!phone) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  const gate = await canSend(phone);
  if (!gate.ok) return NextResponse.json({ error: "rate_limited", waitSec: gate.waitSec }, { status: 429 });
  const { code } = await issueOtp(phone);
  try {
    await sendWA(phone, `Kode masuk Slizebiz: ${code}. Berlaku 10 menit, jangan dibagikan.`);
  } catch {
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
