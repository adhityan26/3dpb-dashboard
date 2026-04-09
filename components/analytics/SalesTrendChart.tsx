"use client"

import { Card, CardContent } from "@/components/ui/card"
import type { DailyPoint } from "@/lib/analytics/types"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts"

interface Props {
  daily: DailyPoint[]
}

function shortDate(s: string): string {
  const [, m, d] = s.split("-")
  return `${d}/${m}`
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

export function SalesTrendChart({ daily }: Props) {
  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold mb-3">
          📈 Tren Omzet &amp; Ad Spend Harian
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={daily.map((d) => ({ ...d, label: shortDate(d.date) }))}
              margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={fmtJuta}
                width={50}
              />
              <Tooltip
                formatter={(value, name) => {
                  const n = typeof value === "number" ? value : Number(value)
                  if (name === "orders") return [n, "Pesanan"]
                  return [fmtIdr(n), name === "omzet" ? "Omzet" : "Ad Spend"]
                }}
                labelFormatter={(label) => `Tanggal: ${label}`}
              />
              <Legend
                formatter={(value) =>
                  value === "omzet"
                    ? "Omzet"
                    : value === "adSpend"
                      ? "Ad Spend"
                      : value
                }
                wrapperStyle={{ fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="omzet"
                stroke="#EE4D2D"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="adSpend"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
