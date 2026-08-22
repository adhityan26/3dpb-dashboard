import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAgentAccess } from "@/lib/session-auth";
import { updateDevice, deleteDevice } from "@/lib/devices/service";
import { DeviceNotFound, InvalidPrinterType, InvalidDeviceModel } from "@/lib/devices/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const gate = await requireAgentAccess();
  if (gate instanceof NextResponse) return gate;
  const userId = gate.userId;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { label?: unknown; printerType?: unknown; model?: unknown };

  try {
    const device = await updateDevice(userId, id, {
      ...(typeof body.label === "string" && { label: body.label }),
      ...(typeof body.printerType === "string" && { printerType: body.printerType }),
      ...(typeof body.model === "string" && { model: body.model }),
    });
    return NextResponse.json(device);
  } catch (e) {
    if (e instanceof DeviceNotFound) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof InvalidPrinterType) return NextResponse.json({ error: "invalid_printer_type" }, { status: 400 });
    if (e instanceof InvalidDeviceModel) return NextResponse.json({ error: "invalid_device_model" }, { status: 400 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

/**
 * Sengaja HANYA cek login, tanpa gate paidCore (beda dari PATCH/POST): user yang paketnya sudah
 * habis harus tetap bisa membereskan/menghapus device miliknya sendiri — memaksa mereka bayar dulu
 * cuma untuk menghapus data sendiri tak masuk akal, dan hapus tak pernah menaikkan pemakaian slot.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;

  try {
    await deleteDevice(userId, id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof DeviceNotFound) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
