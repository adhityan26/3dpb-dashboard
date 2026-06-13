"use client"

import { useRouter } from "next/navigation"
import type { LgOrder } from "@/lib/light-generator/types"

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-gray-500",
  paid:       "bg-blue-500",
  generating: "bg-yellow-500",
  ready:      "bg-green-500",
  shipped:    "bg-purple-500",
  cancelled:  "bg-red-500",
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "bg-gray-500"
  return <span className={`inline-block px-2 py-0.5 rounded text-white text-xs font-medium ${color}`}>{status}</span>
}

export function LgOrderTable({ orders }: { orders: LgOrder[] }) {
  const router = useRouter()
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4">Order ID</th>
            <th className="py-2 pr-4">Nama</th>
            <th className="py-2 pr-4">Ukuran</th>
            <th className="py-2 pr-4">Shape</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Tanggal</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const cfg = JSON.parse(o.configJsonOperator ?? o.configJson) as { size?: string; shape?: string }
            return (
              <tr
                key={o.id}
                className="border-b hover:bg-muted/30 cursor-pointer"
                onClick={() => router.push(`/light-generator/${o.id}`)}
              >
                <td className="py-2 pr-4 font-mono">
                  <span className="inline-flex items-center gap-2">
                    {o.id}
                    {o.isInternal && (
                      <span className="inline-block px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 text-[10px] font-semibold uppercase tracking-wide">
                        Internal
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-2 pr-4">{o.customerName}</td>
                <td className="py-2 pr-4">{cfg.size ?? "-"}</td>
                <td className="py-2 pr-4">{cfg.shape ?? "-"}</td>
                <td className="py-2 pr-4"><StatusBadge status={o.status} /></td>
                <td className="py-2 pr-4 text-xs text-muted-foreground">
                  {new Date(o.createdAt).toLocaleDateString("id-ID")}
                </td>
              </tr>
            )
          })}
          {orders.length === 0 && (
            <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Tidak ada order</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
