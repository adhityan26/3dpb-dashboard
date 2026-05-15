import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  const shopeeRows = await prisma.config.findMany({
    where: { key: { startsWith: 'shopee' } },
    select: { key: true, value: true, updatedAt: true }
  })
  const shopee: Record<string, string> = {}
  shopeeRows.forEach(r => {
    shopee[r.key] = r.key.includes('token')
      ? r.value.substring(0, 15) + '...' + ` (updated: ${r.updatedAt.toISOString()})`
      : r.value
  })
  return NextResponse.json({
    role: session?.user?.role ?? null,
    shopee_db: shopee,
    env_shop_id: process.env.SHOPEE_SHOP_ID,
    env_partner_id: process.env.SHOPEE_PARTNER_ID,
    env_base_url: process.env.SHOPEE_BASE_URL,
  })
}
