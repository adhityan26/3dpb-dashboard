import { auth } from "@/lib/auth"
import { getProductsKpi } from "@/lib/products/service"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const kpi = await getProductsKpi()
  return NextResponse.json(kpi)
}
