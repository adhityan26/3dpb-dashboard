import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { TabNav } from "@/components/layout/TabNav"
import { countBelumCetak } from "@/lib/orders/service"

async function getBadges(): Promise<Record<string, number>> {
  // Don't let Shopee API failures break the whole dashboard — badges are optional.
  try {
    const belumCetak = await countBelumCetak()
    return { order: belumCetak }
  } catch (err) {
    console.warn("Failed to fetch badge counts:", err)
    return {}
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const badges = await getBadges()

  return (
    <div className="min-h-screen bg-gray-50">
      <TabNav role={session.user.role} badges={badges} />
      <main className="max-w-6xl mx-auto p-4">{children}</main>
    </div>
  )
}
