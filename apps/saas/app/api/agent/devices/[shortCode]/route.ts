import { NextResponse } from "next/server";
import { requireAgentToken } from "@/lib/agent-auth";
import { updateDeviceModelByShortCode } from "@/lib/devices/service";
import { DeviceNotFound, InvalidDeviceModel } from "@/lib/devices/errors";

type Ctx = { params: Promise<{ shortCode: string }> };

/**
 * PATCH-only, Bearer agent-token — Agent mengusulkan model setelah pairing (lihat
 * apps/agent/src/renderer/screens/PairingScreen.tsx). Sengaja HANYA menerima `model`: Agent
 * tak boleh mengubah label/printerType/kepemilikan device lewat jalur ini.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const result = await requireAgentToken(req);
  if (result instanceof NextResponse) return result;
  const { shortCode } = await params;
  const body = (await req.json().catch(() => ({}))) as { model?: unknown };
  if (typeof body.model !== "string") {
    return NextResponse.json({ error: "invalid_body", reason: "model wajib diisi" }, { status: 400 });
  }

  try {
    const device = await updateDeviceModelByShortCode(result.userId, shortCode, body.model);
    return NextResponse.json(device);
  } catch (e) {
    if (e instanceof DeviceNotFound) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof InvalidDeviceModel) return NextResponse.json({ error: "invalid_device_model" }, { status: 400 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
