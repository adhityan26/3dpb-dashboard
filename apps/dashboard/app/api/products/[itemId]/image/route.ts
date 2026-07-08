import { auth } from "@/lib/auth"
import { uploadImageToShopee, updateItemImages } from "@/lib/shopee/media"
import { getItemBaseInfoBatch } from "@/lib/shopee/products"
import { NextRequest, NextResponse } from "next/server"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB (Shopee limit)
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"])

interface RouteContext {
  params: Promise<{ itemId: string }>
}

/**
 * Replace the primary (first) image of a product.
 *
 * Body: multipart/form-data with field `image` (single file)
 *
 * Flow:
 *   1. Validate file (size, type)
 *   2. Upload to Shopee media_space → get new image_id
 *   3. Fetch current item to get existing image_id_list
 *   4. Replace index 0 with new image_id
 *   5. Call update_item → Shopee persists & may trigger review
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { itemId } = await ctx.params
  const itemIdNum = Number(itemId)
  if (!itemIdNum || Number.isNaN(itemIdNum)) {
    return NextResponse.json({ error: "Invalid itemId" }, { status: 400 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart body" },
      { status: 400 },
    )
  }

  const file = formData.get("image")
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'image' file field" },
      { status: 400 },
    )
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File terlalu besar (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` },
      { status: 400 },
    )
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      {
        error: `Jenis file tidak didukung (${file.type}). Gunakan JPEG/PNG/WebP.`,
      },
      { status: 400 },
    )
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())

    // Step 1: Upload new image to Shopee media_space
    const uploaded = await uploadImageToShopee(buffer, file.name, file.type)

    // Step 2: Fetch current item to get existing image_id_list
    const items = await getItemBaseInfoBatch([itemIdNum])
    if (items.length === 0) {
      return NextResponse.json(
        { error: "Produk tidak ditemukan di Shopee" },
        { status: 404 },
      )
    }

    const currentIds = items[0].image?.image_id_list ?? []

    // Step 3: Replace index 0 (primary image) with new image_id.
    // If there are no existing images, just use the new one.
    const newIds =
      currentIds.length === 0
        ? [uploaded.imageId]
        : [uploaded.imageId, ...currentIds.slice(1)]

    // Step 4: Call update_item
    await updateItemImages(itemIdNum, newIds)

    return NextResponse.json({
      ok: true,
      imageId: uploaded.imageId,
      imageUrl: uploaded.imageUrl,
      totalImages: newIds.length,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error(`POST /api/products/${itemId}/image failed:`, err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Next.js route segment config — increase body size limit for this route
export const runtime = "nodejs"
