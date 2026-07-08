import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { shopeeGetLogistics } from "@/lib/shopee/create-product"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const logistics = await shopeeGetLogistics()
  return NextResponse.json(logistics)
}
