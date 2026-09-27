import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getFastCouriers, setFastCouriers } from "@/lib/working-projects/service"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const couriers = await getFastCouriers()
  return NextResponse.json({ couriers })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  if (!Array.isArray(body.couriers) || !body.couriers.every((c: unknown) => typeof c === "string")) {
    return NextResponse.json({ error: "couriers must be an array of strings" }, { status: 400 })
  }

  await setFastCouriers(body.couriers)
  return NextResponse.json({ ok: true })
}
