import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { cancel } from "@/lib/payment/service";

export async function PUT(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isOwner(session?.user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  await cancel(id);
  return NextResponse.json({ ok: true });
}
