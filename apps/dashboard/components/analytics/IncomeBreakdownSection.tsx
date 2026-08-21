"use client"

import { Card, CardContent } from "@/components/ui/card"
import type { IncomeBreakdownSummary, ProductIncomeBreakdown } from "@/lib/analytics/types"

interface Props {
  summary: IncomeBreakdownSummary
  products: ProductIncomeBreakdown[]
}

function fmt(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount)
}

function fmtOrNull(amount: number | null): string {
  return amount === null ? "Belum final" : fmt(amount)
}

export function IncomeBreakdownSection({ summary, products }: Props) {
  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-1">📊 Breakdown Penghasilan</h3>
          <p className="text-xs text-gray-400">
            {summary.completedOrderCount} dari {summary.totalOrderCount} order sudah final (selesai)
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-gray-500 text-xs">Buyer Bayar</div>
            <div className="font-medium">{fmt(summary.totalBuyerPayment)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">Harga Shopee</div>
            <div className="font-medium">{fmt(summary.totalShopeePrice)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">Biaya Admin</div>
            <div className="font-medium text-red-600">{fmt(summary.totalAdminFee)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">Diterima Bersih</div>
            <div className="font-medium text-green-700">{fmt(summary.totalReceived)}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs border-b">
                <th className="py-1 pr-2">Produk</th>
                <th className="py-1 pr-2 text-right">Qty</th>
                <th className="py-1 pr-2 text-right">Buyer Bayar</th>
                <th className="py-1 pr-2 text-right">Harga Shopee</th>
                <th className="py-1 pr-2 text-right">Biaya Admin</th>
                <th className="py-1 text-right">Diterima</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.productName} className="border-b last:border-0">
                  <td className="py-1 pr-2">
                    {p.productName}
                    {p.hasReturn && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
                        Ada refund
                      </span>
                    )}
                  </td>
                  <td className="py-1 pr-2 text-right">{p.qty}</td>
                  <td className="py-1 pr-2 text-right">{fmt(p.buyerPayment)}</td>
                  <td className="py-1 pr-2 text-right">{fmt(p.shopeePrice)}</td>
                  <td
                    className={`py-1 pr-2 text-right ${p.adminFee === null ? "italic text-gray-400" : ""}`}
                  >
                    {fmtOrNull(p.adminFee)}
                  </td>
                  <td className={`py-1 text-right ${p.received === null ? "italic text-gray-400" : ""}`}>
                    {fmtOrNull(p.received)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400">
          Biaya admin per produk adalah estimasi proporsional dari total biaya per order,
          karena Shopee tidak menyediakan rincian biaya per item.
        </p>
      </CardContent>
    </Card>
  )
}
