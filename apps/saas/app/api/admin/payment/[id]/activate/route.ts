import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { activate } from "@/lib/payment/service";
import { notifyActivated } from "@/lib/payment/notify";
import { prisma } from "@/lib/db";

export async function PUT(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isOwner(session?.user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const p = await activate(id, session!.user!.email!);
  if (p) {
    const user = await prisma.user.findUnique({ where: { id: p.userId }, select: { phone: true, email: true } });
    if (user) await notifyActivated(user);
  }
  return NextResponse.json({ ok: true });
}
