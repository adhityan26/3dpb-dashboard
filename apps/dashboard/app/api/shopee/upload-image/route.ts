import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { uploadImageToShopee } from "@/lib/shopee/media"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get("image") as File | null
  if (!file) return NextResponse.json({ error: "image is required" }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const result = await uploadImageToShopee(buffer, file.name, file.type || "image/jpeg")
  return NextResponse.json(result)
}
