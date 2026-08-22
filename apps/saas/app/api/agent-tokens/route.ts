import { NextResponse } from "next/server";
import { requireAgentAccess } from "@/lib/session-auth";
import { generateToken, listTokens } from "@/lib/agent-tokens/service";

export async function GET() {
  const gate = await requireAgentAccess();
  if (gate instanceof NextResponse) return gate;
  return NextResponse.json(await listTokens(gate.userId));
}

export async function POST() {
  const gate = await requireAgentAccess();
  if (gate instanceof NextResponse) return gate;
  const { id, rawToken } = await generateToken(gate.userId);
  return NextResponse.json({ id, token: rawToken });
}
