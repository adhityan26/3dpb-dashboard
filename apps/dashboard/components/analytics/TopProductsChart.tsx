"use client"

import { Card, CardContent } from "@/components/ui/card"
import type { TopProduct } from "@/lib/analytics/types"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"

interface Props {
  products: TopProduct[]
}

function fmtJuta(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}rb`
  return String(n)
}

function fmtIdr(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n)
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s
}

export function TopProductsChart({ products }: Props) {
  if (products.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">🏆 Top Produk</h3>
          <div className="text-center text-gray-400 text-sm py-8">
            Belum ada data
          </div>
        </CardContent>
      </Card>
    )
  }

  const data = products.map((p) => ({
    name: truncate(p.productName, 30),
    fullName: p.productName,
    omzet: p.omzet,
    qty: p.qty,
  }))

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold mb-3">🏆 Top Produk by Omzet</h3>
        <div style={{ height: Math.max(240, data.length * 32) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 24, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                type="number"
                tick={{ fontSize: 10 }}
                tickFormatter={fmtJuta}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 10 }}
                width={180}
              />
              <Tooltip
                formatter={(value, _key, item) => {
                  const n = typeof value === "number" ? value : Number(value)
                  const name = (item?.payload as { fullName?: string })
                    ?.fullName
                  return [fmtIdr(n), name ?? ""]
                }}
              />
              <Bar dataKey="omzet" fill="#EE4D2D" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
