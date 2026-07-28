import { NextResponse } from "next/server";
import { requireAgentToken } from "@/lib/agent-auth";
import { getLayoutOrNull } from "@/lib/cyd-layout/service";

export async function GET(req: Request) {
  const result = await requireAgentToken(req);
  if (result instanceof NextResponse) return result;
  const layout = await getLayoutOrNull(result.userId);
  if (!layout) return NextResponse.json({ error: "no_layout" }, { status: 404 });
  return NextResponse.json(layout);
}
