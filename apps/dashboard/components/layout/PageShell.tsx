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
      {children}
    </>
  )
}
