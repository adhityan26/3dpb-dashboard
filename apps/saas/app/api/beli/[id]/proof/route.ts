import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isOwner } from "@/lib/owner";
import { getProof } from "@/lib/storage/r2";

const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return notFound();
  const { id } = await ctx.params;

  const p = await prisma.payment.findUnique({ where: { id } });
  if (!p?.proofKey) return notFound();
  if (!isOwner(session.user?.email) && p.userId !== userId) return notFound();

  let obj;
  try {
    obj = await getProof(p.proofKey);
  } catch {
    return notFound();
  }
  if (!obj) return notFound();

  return new NextResponse(obj.body, {
    status: 200,
    headers: {
      "Content-Type": p.proofType ?? obj.contentType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
