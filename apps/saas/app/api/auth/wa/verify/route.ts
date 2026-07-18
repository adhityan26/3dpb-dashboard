import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/wa/normalize";
import { verifyOtp } from "@/lib/wa/otp";
import { upsertUserByPhone, createUserSession } from "@/lib/wa/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(String(body?.input ?? ""));
  const code = String(body?.code ?? "");
  if (!phone || !/^\d{6}$/.test(code)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const result = await verifyOtp(phone, code);
  if (result !== "ok") return NextResponse.json({ error: result }, { status: 401 });
  const user = await upsertUserByPhone(phone);
  await createUserSession(user.id);
  return NextResponse.json({ ok: true });
}
