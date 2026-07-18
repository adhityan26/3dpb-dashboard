import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { getAllConfig, setConfig, DEFAULT_CONFIG, parsePrice } from "@/lib/config";

export async function GET() {
  const session = await auth();
  if (!isOwner(session?.user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await getAllConfig());
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!isOwner(session?.user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const known = new Set(Object.keys(DEFAULT_CONFIG));

  // Validasi dulu (allowlist key + bentuk nilai) sebelum menulis apa pun.
  const updates: [string, string][] = [];
  for (const [key, raw] of Object.entries(body)) {
    if (!known.has(key)) continue; // hanya key yang dikenal
    const value = String(raw ?? "");
    const trimmed = value.trim();
    if (key.startsWith("price.") && trimmed !== "" && parsePrice(trimmed) === null) {
      return NextResponse.json({ error: "invalid_value", key, reason: "harus angka" }, { status: 400 });
    }
    if (key === "qris.static" && trimmed !== "" && !trimmed.startsWith("0002")) {
      return NextResponse.json({ error: "invalid_value", key, reason: "bukan payload QRIS (harus diawali 0002)" }, { status: 400 });
    }
    updates.push([key, value]);
  }

  for (const [key, value] of updates) {
    await setConfig(key, value);
  }
  return NextResponse.json(await getAllConfig());
}
