import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

const VALID_SIZES = ["40x30", "30x20", "50x30"]

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const latest = await prisma.filamentCatalog.findFirst({
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true },
  })

  const stickerSize = await prisma.config.findUnique({ where: { key: "sticker_size" } })

  return NextResponse.json({
    lastCatalogSync: latest?.syncedAt?.toISOString() ?? null,
    stickerSize: stickerSize?.value ?? "40x30",
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { stickerSize } = await req.json() as { stickerSize?: string }

  if (!stickerSize || !VALID_SIZES.includes(stickerSize)) {
    return NextResponse.json({ error: "Invalid stickerSize" }, { status: 400 })
  }

  await prisma.config.upsert({
    where: { key: "sticker_size" },
    update: { value: stickerSize },
    create: { key: "sticker_size", value: stickerSize },
  })

  return NextResponse.json({ ok: true })
}
