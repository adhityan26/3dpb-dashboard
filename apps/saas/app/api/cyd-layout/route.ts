import { NextResponse } from "next/server";
import { requirePaidCore } from "@/lib/session-auth";
import { getLayout, saveLayoutForUser, InvalidLayoutConfig } from "@/lib/cyd-layout/service";

export async function GET() {
  const gate = await requirePaidCore();
  if (gate instanceof NextResponse) return gate;
  const layout = await getLayout(gate.userId);
  return NextResponse.json(layout);
}

export async function PUT(req: Request) {
  const gate = await requirePaidCore();
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => null);

  try {
    // Cek kepemilikan shortCode + upsert dijalankan atomik di dalam saveLayoutForUser (lihat
    // komentarnya) — jangan dipecah lagi jadi listDevices() + saveLayout() di sini.
    const saved = await saveLayoutForUser(gate.userId, body);
    return NextResponse.json(saved);
  } catch (e) {
    if (e instanceof InvalidLayoutConfig) {
      return NextResponse.json({ error: "invalid_layout", reason: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
