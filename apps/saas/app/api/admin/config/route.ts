import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { getAllConfig, setConfig } from "@/lib/config";

export async function GET() {
  const session = await auth();
  if (!isOwner(session?.user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await getAllConfig());
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!isOwner(session?.user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json()) as Record<string, string>;
  for (const [key, value] of Object.entries(body)) {
    await setConfig(key, String(value));
  }
  return NextResponse.json(await getAllConfig());
}
