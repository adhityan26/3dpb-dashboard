import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateToken, listTokens } from "@/lib/agent-tokens/service";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json(await listTokens(userId));
}

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id, rawToken } = await generateToken(userId);
  return NextResponse.json({ id, token: rawToken });
}
