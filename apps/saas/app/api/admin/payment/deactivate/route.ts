import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { deactivate } from "@/lib/payment/service";

export async function PUT(req: Request) {
  const session = await auth();
  if (!isOwner(session?.user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const userId = String(body?.userId ?? "");
  if (!userId) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await deactivate(userId);
  return NextResponse.json({ ok: true });
}
