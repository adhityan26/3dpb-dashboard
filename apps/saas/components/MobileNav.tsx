"use client";
import { MobileBottomNav, type MobileBottomNavTab } from "@3pb/ui";
import { ThemeToggle } from "./ThemeToggle";
import { performLogout } from "@/lib/logout-client";

/**
 * "use client" WAJIB di sini -- `onLogout` butuh REFERENSI FUNGSI client-side (bukan Server
 * Action), dan Next.js menolak fungsi biasa lewat sebagai prop dari server component ke client
 * component ("Event handlers cannot be passed to Client Component props" -- insiden produksi
 * nyata: lolos semua test jsdom/RTL karena itu me-render satu tree tanpa batas server/client
 * sungguhan, cuma meledak di runtime Next.js asli). PageShell.tsx (server component, dipakai
 * semua halaman ber-auth) TETAP boleh mengirim `tabs`/`userLabel` (data biasa, serializable)
 * ke sini -- yang tak boleh cuma fungsi/handler yang lewat batas itu.
 */
export function MobileNav({ tabs, userLabel }: { tabs: MobileBottomNavTab[]; userLabel?: string }) {
  return <MobileBottomNav tabs={tabs} userName={userLabel} onLogout={performLogout} extra={<ThemeToggle />} />;
}
