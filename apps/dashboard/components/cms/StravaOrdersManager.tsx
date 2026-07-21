"use client"

import { useStravaOrders, usePatchStravaOrder } from "@/lib/hooks/use-cms"
import { CollectionList } from "./shared/CollectionList"
import type { StravaOrder } from "@/lib/sanity/types"

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  new:          { bg: "rgba(245,158,11,0.2)",  color: "#f59e0b" },
  "in-progress":{ bg: "rgba(99,102,241,0.2)",  color: "#a5b4fc" },
  done:         { bg: "rgba(34,197,94,0.15)",  color: "#4ade80" },
  cancelled:    { bg: "rgba(239,68,68,0.15)",  color: "#fca5a5" },
}

export function StravaOrdersManager() {
  const { data: items = [], isLoading } = useStravaOrders()
  const patch = usePatchStravaOrder()

  if (isLoading) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  const newCount = items.filter((i) => i.status === "new").length

  return (
    <div className="space-y-4">
      {/* Judul halaman diurus PageShell di halaman landing */}
      <h2 className="text-[15px] font-bold text-white">
        🗺️ Strava Map Orders
        <span className="ml-2 text-[12px] font-normal text-white/40">
          {items.length} total{newCount > 0 ? ` · ${newCount} baru perlu diproses` : ""}
        </span>
      </h2>

      <CollectionList
        items={items}
        emptyMessage="Belum ada order Strava Map."
        columns={[
          {
            key: "customer",
            label: "Pelanggan",
            width: "160px",
            render: (item: StravaOrder) => (
              <div>
                <div className="text-[12px] text-white/80">{item.name}</div>
                <a href={`https://wa.me/${item.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-[10px]" style={{ color: "rgba(74,222,128,0.7)" }}>
                  {item.whatsapp}
                </a>
              </div>
            ),
          },
          {
            key: "config",
            label: "Konfigurasi",
            render: (item: StravaOrder) => (
              <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                {item.size} · {item.shape}
              </div>
            ),
          },
          {
            key: "submitted",
            label: "Tanggal",
            width: "100px",
            render: (item: StravaOrder) => (
              <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {new Date(item.submittedAt).toLocaleDateString("id-ID")}
              </div>
            ),
          },
          {
            key: "status",
            label: "Status",
            width: "160px",
            render: (item: StravaOrder) => (
              <select
                value={item.status}
                onChange={(e) => patch.mutate({ id: item._id, status: e.target.value })}
                disabled={patch.isPending}
                className="rounded-[6px] px-2 py-1 text-[11px] font-medium border-0 cursor-pointer"
                style={{ ...(STATUS_COLORS[item.status] ?? {}), background: STATUS_COLORS[item.status]?.bg }}
              >
                <option value="new">new</option>
                <option value="in-progress">in-progress</option>
                <option value="done">done</option>
                <option value="cancelled">cancelled</option>
              </select>
            ),
          },
        ]}
      />
    </div>
  )
}
