"use client"

import Link from "next/link"

const LINKS = [
  { href: "/cyd-layout", icon: "🖥️", title: "Layout Rak Printer", desc: "Atur susunan printer di layar CYD internal (tanpa reflash)" },
  { href: "/firmware-update", icon: "⬆️", title: "Firmware Update", desc: "Cek versi & push update firmware CYD via OTA" },
] as const

export function CydDeviceCard() {
  return (
    <div className="rounded-[16px] p-5 space-y-4 g-card">
      <div>
        <div className="text-sm font-semibold g-t1">🖥️ CYD Display</div>
        <div className="text-xs mt-0.5 g-t4">Konfigurasi layar monitoring printer (Cheap Yellow Display)</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-[8px] p-4 flex items-start gap-3 transition-opacity hover:opacity-80"
            style={{ background: "var(--g-inner)" }}
          >
            <span className="text-xl">{l.icon}</span>
            <span>
              <span className="block text-sm font-semibold g-t1">{l.title}</span>
              <span className="block text-xs mt-0.5 g-t4">{l.desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
