import type { AnalyticsData, DailyPoint, TopProduct } from "./types"

/**
 * Generate mock analytics data for sandbox/development.
 * Produces realistic-looking data based on the 3D Printing Bandung analysis.
 */
export function generateMockAnalytics(
  startDate: string,
  endDate: string,
): AnalyticsData {
  const start = new Date(startDate + "T00:00:00")
  const end = new Date(endDate + "T00:00:00")
  const days = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1,
  )

  const daily: DailyPoint[] = []
  let totalOmzet = 0
  let totalOrders = 0
  let totalAdSpend = 0

  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000)
    // Simulate a declining trend (mirrors real data)
    const dayFactor = 1 - (i / days) * 0.4
    const variance = 0.8 + Math.random() * 0.4

    const omzet = Math.round(6000000 * dayFactor * variance)
    const orders = Math.round(omzet / 43000)
    const adSpend = Math.round(omzet * 0.09 * variance)

    totalOmzet += omzet
    totalOrders += orders
    totalAdSpend += adSpend

    daily.push({
      date: d.toISOString().slice(0, 10),
      omzet,
      orders,
      adSpend,
    })
  }

  const topProducts: TopProduct[] = [
    {
      productName: "3D Print Crocs Charm Jibbitz Swoosh Multicolor",
      qty: Math.round(totalOrders * 0.28),
      omzet: Math.round(totalOmzet * 0.34),
    },
    {
      productName: "Aksesoris Sendal Fire Wave",
      qty: Math.round(totalOrders * 0.2),
      omzet: Math.round(totalOmzet * 0.22),
    },
    {
      productName: "3D Print Crocs Charm Jibbitz Swoosh Side Logo",
      qty: Math.round(totalOrders * 0.14),
      omzet: Math.round(totalOmzet * 0.115),
    },
    {
      productName: "3D Print Aksesoris Sendal Dudukan Samping",
      qty: Math.round(totalOrders * 0.1),
      omzet: Math.round(totalOmzet * 0.107),
    },
    {
      productName: "3D Print Jibbitz Swoosh Pin Atas",
      qty: Math.round(totalOrders * 0.06),
      omzet: Math.round(totalOmzet * 0.05),
    },
  ]

  const overallRoas = totalAdSpend > 0 ? totalOmzet / totalAdSpend : 0
  const avgOrderValue = totalOrders > 0 ? totalOmzet / totalOrders : 0
  const grossProfit = totalOmzet - totalAdSpend

  return {
    range: { startDate, endDate },
    fetchedAt: new Date().toISOString(),
    kpi: {
      totalOmzet,
      totalOrders,
      totalAdSpend,
      overallRoas,
      avgOrderValue,
      grossProfit,
      netProfit: null,
      hppCoverage: 0,
    },
    daily,
    topProducts,
  }
}
