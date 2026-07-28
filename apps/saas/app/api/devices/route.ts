import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { listDevices, createDevice } from "@/lib/devices/service";
import { SlotLimitExceeded, InvalidPrinterType } from "@/lib/devices/errors";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const devices = await listDevices(userId);
  return NextResponse.json(devices);
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const ent = await getEntitlement(userId);
  if (!capabilities(ent).paidCore) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { label?: unknown; printerType?: unknown };
  if (typeof body.label !== "string" || !body.label.trim()) {
    return NextResponse.json({ error: "invalid_body", reason: "label wajib diisi" }, { status: 400 });
  }
  if (typeof body.printerType !== "string") {
    return NextResponse.json({ error: "invalid_body", reason: "printerType wajib diisi" }, { status: 400 });
  }

  try {
    const device = await createDevice(userId, { label: body.label, printerType: body.printerType });
    return NextResponse.json(device);
  } catch (e) {
    if (e instanceof SlotLimitExceeded) {
      return NextResponse.json({ error: "slot_limit_exceeded", limit: e.limit }, { status: 409 });
    }
    if (e instanceof InvalidPrinterType) {
      return NextResponse.json({ error: "invalid_printer_type" }, { status: 400 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
