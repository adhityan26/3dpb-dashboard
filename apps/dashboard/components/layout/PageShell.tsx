import type { ReactNode } from "react"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"

/**
 * Kerangka SEMUA halaman dashboard. Pedoman lengkap: `docs/ui-page-layout.md`.
 *
 * Aturan: `title` WAJIB — judul halaman bagian dari kerangka, bukan tempelan
 * tiap halaman, supaya tak ada lagi halaman yang "menggantung" tanpa judul dan
 * jaraknya seragam. TypeScript menolak halaman tanpa judul; itu disengaja.
 *
 * Beda dengan `PageShell` di `apps/saas`: di sini shell TIDAK merender
 * `<main>`, nav, atau background — semuanya sudah diurus
 * `app/(dashboard)/layout.tsx`. Shell ini hanya blok judul + konten.
 *
 * Halaman ber-tab (finance, produk, landing) mengisi `title` sesuai tab/section
 * yang aktif, supaya judulnya selalu menggambarkan yang sedang dilihat.
 *
 * Judul render DI LUAR card (biar konsisten sama halaman yang punya sidebar sendiri,
 * mis. Order/Produk — sidebar-nya sudah berupa glass-card mengambang via
 * `SectionSidebar`, jadi area konten butuh treatment serupa biar kebaca sebagai
 * section terpisah, bukan flat). `children` dibungkus card glass tipis (lebih halus
 * dari SectionSidebar biar sidebar tetap jadi fokus visual utama).
 */
export function PageShell({
  title,
  description,
  actions,
  children,
}: {
  /** Judul halaman (wajib) — tampil sebagai H1 gradient. */
  title: string
  /** Kalimat singkat di bawah judul. Opsional. */
  description?: string
  /** Aksi di kanan judul (tombol/link). Opsional. */
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <GlassPageHeader title={title} subtitle={description}>
        {actions}
      </GlassPageHeader>
      <div
        className="
          rounded-2xl p-4 md:p-5
          bg-white/[0.22] dark:bg-white/[0.035]
          backdrop-blur-[14px] dark:backdrop-blur-[10px] saturate-[150%]
          border border-[rgba(200,190,255,0.2)] dark:border-indigo-500/[0.08]
          shadow-[0_4px_16px_rgba(99,102,241,0.04),inset_0_1px_0_rgba(255,255,255,0.6)]
          dark:shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)]
        "
      >
        {children}
      </div>
    </>
  )
}
