import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { validateOrderUnits } from "@/lib/working-projects/order-units"
import { createWorkingProject, createWorkingProjectsForOrder, summarizeOrderCreate } from "@/lib/working-projects/service"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rows = await prisma.workingProject.findMany({
    orderBy: { createdAt: "desc" },
    // Stable sibling order: income rounding remainders are allocated by position.
    include: { order: { include: { projects: { select: { id: true, itemPrice: true, status: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } } },
  })
  // Flatten: the client allocates the order income itself, so it gets the order's income
  // fields plus the sibling list, without the nested projects array on `order`.
  const projects = rows.map(({ order, ...wp }) => {
    if (!order) return { ...wp, order: null, siblings: [] }
    const { projects: siblings, ...o } = order
    return {
      ...wp,
      order: {
        salePrice: o.salePrice, feesTotal: o.feesTotal, netIncome: o.netIncome,
        incomeStatus: o.incomeStatus, incomeSettledAt: o.incomeSettledAt, quotationId: o.quotationId,
      },
      siblings,
    }
  })
  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  if (!body.source || !body.forumChannelId || !body.customer || !body.product) {
    return NextResponse.json({ error: "source, forumChannelId, customer, product are required" }, { status: 400 })
  }

  if ((body.source === 'shopee' || body.source === 'tokopedia') && body.sourceOrderNo) {
    if (body.units === undefined || body.units === null) {
      return NextResponse.json({ error: 'units wajib untuk order marketplace' }, { status: 400 })
    }
    const v = validateOrderUnits(body.units)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    const { units: _units, forumChannelId, ...rest } = body
    const batch = await createWorkingProjectsForOrder({
      source: body.source,
      sourceOrderNo: body.sourceOrderNo,
      units: v.units,
      base: { ...rest, forumChannelIdFor: () => forumChannelId },
    })
    return NextResponse.json(summarizeOrderCreate(batch), { status: 201 })
  }

  const result = await createWorkingProject(body)
  return NextResponse.json(result, { status: 201 })
}
