import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listDevices } from "@/lib/devices/service";
import { getLayout, saveLayout, InvalidLayoutConfig } from "@/lib/cyd-layout/service";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const layout = await getLayout(userId);
  return NextResponse.json(layout);
}

export async function PUT(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const devices = await listDevices(userId);
  const ownedShortCodes = devices.map((d) => d.shortCode);

  try {
    const saved = await saveLayout(userId, body, ownedShortCodes);
    return NextResponse.json(saved);
  } catch (e) {
    if (e instanceof InvalidLayoutConfig) {
      return NextResponse.json({ error: "invalid_layout", reason: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
