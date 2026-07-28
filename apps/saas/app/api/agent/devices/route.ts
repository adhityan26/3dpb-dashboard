import { NextResponse } from "next/server";
import { requireAgentToken } from "@/lib/agent-auth";
import { listDevices } from "@/lib/devices/service";

export async function GET(req: Request) {
  const result = await requireAgentToken(req);
  if (result instanceof NextResponse) return result;
  const devices = await listDevices(result.userId);
  return NextResponse.json(devices);
}
