import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { revokeToken } from "@/lib/agent-tokens/service";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;

  try {
    await revokeToken(userId, id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    // revokeToken = `update where { id, userId }` → Prisma lempar P2025 kalau id tak ada ATAU
    // milik user lain. Dua-duanya sengaja dipetakan ke 404 yang sama (jangan bocorkan bahwa
    // id-nya eksis tapi punya orang lain). Tanpa ini, P2025 lolos jadi unhandled 500.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
