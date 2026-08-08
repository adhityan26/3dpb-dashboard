/**
 * Data murni (BUKAN komponen) -- SENGAJA di modul terpisah tanpa "use client". AppHeader.tsx
 * ("use client") dan PageShell.tsx (server component, dipakai tiap halaman ber-auth) DUA-DUANYA
 * butuh TABS; server component TAK BISA impor named-export data biasa dari modul "use client"
 * (Next.js RSC compile modul begitu jadi client-reference proxy di sisi server, bukan nilai
 * asli) -- insiden nyata: lolos semua test unit (jsdom tak mensimulasikan batas ini) & `next
 * build`, tapi TypeError "TABS.filter is not a function" di runtime produksi begitu PageShell
 * dipanggil (semua halaman ber-auth down). JANGAN pindahkan balik ke AppHeader.tsx.
 */
export type NavKey = "kalkulator" | "setting" | "admin" | "beli" | "printer";

export type Tab = { key: string; href?: string; icon: string; label: string; soon?: boolean; ownerOnly?: boolean };

/** Peta modul. Yang belum dibangun TIDAK dilinkkan (badge "soon") — tak ada nav buntu.
 *  Tambahkan `href` + hapus `soon` saat modulnya benar-benar jadi. */
export const TABS: Tab[] = [
  { key: "kalkulator", href: "/", icon: "🧮", label: "Kalkulator" },
  { key: "invoice", icon: "🧾", label: "Invoice", soon: true },
  { key: "po", icon: "📦", label: "PO", soon: true },
  { key: "filamen", icon: "🧵", label: "Filamen", soon: true },
  { key: "printer", href: "/printer", icon: "🖨️", label: "Printer" },
  { key: "setting", href: "/settings", icon: "⚙️", label: "Setting" },
  { key: "admin", href: "/admin", icon: "🛠️", label: "Admin", ownerOnly: true },
];
