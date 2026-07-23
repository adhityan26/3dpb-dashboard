"use client"

import Link from "next/link"
import { useKeycapOrders, usePatchKeycapOrder } from "@/lib/hooks/use-cms"
import { CollectionList } from "./shared/CollectionList"
import type { SanityKeycapOrder } from "@/lib/sanity/types"

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:   { bg: "rgba(245,158,11,0.2)",  color: "#f59e0b" },
  confirmed: { bg: "rgba(99,102,241,0.2)",  color: "#a5b4fc" },
  printing:  { bg: "rgba(56,189,248,0.2)",  color: "#7dd3fc" },
  done:      { bg: "rgba(34,197,94,0.15)",  color: "#4ade80" },
  cancelled: { bg: "rgba(239,68,68,0.15)",  color: "#fca5a5" },
}

const STATUSES: SanityKeycapOrder["status"][] = ["pending", "confirmed", "printing", "done", "cancelled"]

export function KeycapOrdersManager() {
  const { data: items = [], isLoading } = useKeycapOrders()
  const patch = usePatchKeycapOrder()

  if (isLoading) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  const pendingCount = items.filter((i) => i.status === "pending").length

  return (
    <div className="space-y-4">
      {/* Judul halaman diurus PageShell di halaman landing */}
      <h2 className="text-[15px] font-bold text-white">
        ⌨️ Keycap Orders
        <span className="ml-2 text-[12px] font-normal text-white/40">
          {items.length} total{pendingCount > 0 ? ` · ${pendingCount} baru perlu diproses` : ""}
        </span>
      </h2>

      <CollectionList
        items={items}
        emptyMessage="Belum ada order keycap."
        columns={[
          {
            key: "order",
            label: "Order #",
            width: "130px",
            render: (item: SanityKeycapOrder) => (
              <div className="text-[12px] font-mono text-white/80">{item.orderNumber}</div>
            ),
          },
          {
            key: "customer",
            label: "Pelanggan",
            width: "160px",
            render: (item: SanityKeycapOrder) => (
              <div>
                <div className="text-[12px] text-white/80">{item.customerName}</div>
                <a
                  href={`https://wa.me/${item.customerPhone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px]"
                  style={{ color: "rgba(74,222,128,0.7)" }}
                >
                  {item.customerPhone}
                </a>
              </div>
            ),
          },
          {
            key: "config",
            label: "Konfigurasi",
            render: (item: SanityKeycapOrder) => (
              <div className="flex items-center gap-2">
                <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {item.qty} key · {item.orientation}
                </span>
                <span className="flex gap-1">
                  {item.keys.slice(0, 6).map((k) => (
                    <span
                      key={k._key}
                      title={`${k.char} (${k.baseColor?.name})`}
                      className="inline-block w-3.5 h-3.5 rounded-[5px] border border-white/20"
                      style={{ background: k.baseColor?.hex ?? "#888" }}
                    />
                  ))}
                </span>
              </div>
            ),
          },
          {
            key: "submitted",
            label: "Tanggal",
            width: "100px",
            render: (item: SanityKeycapOrder) => (
              <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {new Date(item.submittedAt).toLocaleDateString("id-ID")}
              </div>
            ),
          },
          {
            key: "status",
            label: "Status",
            width: "130px",
            render: (item: SanityKeycapOrder) => (
              <select
                value={item.status}
                onChange={(e) => patch.mutate({ id: item._id, status: e.target.value })}
                disabled={patch.isPending}
                className="rounded-[5px] px-2 py-1 text-[11px] font-medium border-0 cursor-pointer"
                style={{ ...(STATUS_COLORS[item.status] ?? {}), background: STATUS_COLORS[item.status]?.bg }}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ),
          },
          {
            key: "detail",
            label: "",
            width: "60px",
            render: (item: SanityKeycapOrder) => (
              <Link href={`/keycap/${item._id}`} className="text-[11px]" style={{ color: "rgba(165,180,252,0.9)" }}>
                Detail →
              </Link>
            ),
          },
        ]}
      />
    </div>
  )
}
