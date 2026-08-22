import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAgentAccess } from "@/lib/session-auth";
import { listDevices, createDevice, getDeviceLimit } from "@/lib/devices/service";
import { SlotLimitExceeded, InvalidPrinterType, InvalidDeviceModel } from "@/lib/devices/errors";
import { getEligibleShortCodes } from "@/lib/printer-slots/capacity";

/**
 * Balas `{ devices, limit }`, bukan array telanjang — DeviceList butuh `limit` buat menampilkan
 * "X/Y slot terpakai" tanpa harus menunggu POST gagal 409 dulu untuk tahu batasnya. Sengaja TIDAK
 * dipagari paidCore (beda dari POST/PATCH): user yang entitlement-nya habis tetap boleh MELIHAT
 * (dan menghapus) device miliknya, cuma tak boleh menambah/mengubah.
 */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const [rawDevices, limit, eligibleShortCodes] = await Promise.all([
    listDevices(userId),
    getDeviceLimit(userId),
    getEligibleShortCodes(userId),
  ]);
  const devices = rawDevices.map((d) => ({ ...d, suspended: !eligibleShortCodes.has(d.shortCode) }));
  return NextResponse.json({ devices, limit });
}

export async function POST(req: Request) {
  const gate = await requireAgentAccess();
  if (gate instanceof NextResponse) return gate;

  const body = (await req.json().catch(() => ({}))) as { label?: unknown; printerType?: unknown; model?: unknown };
  if (typeof body.label !== "string" || !body.label.trim()) {
    return NextResponse.json({ error: "invalid_body", reason: "label wajib diisi" }, { status: 400 });
  }
  if (typeof body.printerType !== "string") {
    return NextResponse.json({ error: "invalid_body", reason: "printerType wajib diisi" }, { status: 400 });
  }

  try {
    const device = await createDevice(gate.userId, {
      label: body.label,
      printerType: body.printerType,
      ...(typeof body.model === "string" && { model: body.model }),
    });
    return NextResponse.json(device);
  } catch (e) {
    if (e instanceof SlotLimitExceeded) {
      return NextResponse.json({ error: "slot_limit_exceeded", limit: e.limit }, { status: 409 });
    }
    if (e instanceof InvalidPrinterType) {
      return NextResponse.json({ error: "invalid_printer_type" }, { status: 400 });
    }
    if (e instanceof InvalidDeviceModel) {
      return NextResponse.json({ error: "invalid_device_model" }, { status: 400 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
