"use client"

import { useWaitlist } from "@/lib/hooks/use-cms"
import { CollectionList } from "./shared/CollectionList"
import type { WaitlistEntry } from "@/lib/sanity/types"

export function WaitlistViewer() {
  const { data: items = [], isLoading } = useWaitlist()
  if (isLoading) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-[15px] font-bold text-white">📧 Waitlist</h2>
        <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{items.length} pendaftar</p>
      </div>
      <CollectionList
        items={items}
        emptyMessage="Belum ada yang daftar waitlist."
        columns={[
          {
            key: "email",
            label: "Email",
            render: (item: WaitlistEntry) => <span className="text-[12px] text-white/80">{item.email}</span>,
          },
          {
            key: "name",
            label: "Nama",
            width: "160px",
            render: (item: WaitlistEntry) => <span className="text-[12px] text-white/60">{item.name ?? "-"}</span>,
          },
          {
            key: "date",
            label: "Tanggal",
            width: "120px",
            render: (item: WaitlistEntry) => (
              <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString("id-ID") : "-"}
              </span>
            ),
          },
        ]}
      />
    </div>
  )
}
