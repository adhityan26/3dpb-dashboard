"use client";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";

// Best-effort: bersihkan cache RUNTIME (halaman ber-auth yang mengandung email
// user) sebelum logout, supaya shell itu tak bisa dibuka lagi offline oleh orang
// lain yang pakai device yang sama setelah user ini keluar. SENGAJA tak menghapus
// cache "serwist-precache-*" (asset build statis + /offline — tak mengandung data
// user apa pun) — precache cuma terisi ulang saat service worker baru di-install,
// jadi menghapusnya bikin PWA "kosong" (tak bisa install/offline) sampai deploy
// berikutnya, tanpa manfaat privasi apa pun.
async function clearServiceWorkerCaches() {
  try {
    if (typeof caches === "undefined") return;
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => !key.startsWith("serwist-precache-")).map((key) => caches.delete(key))
    );
  } catch {
    // Cache API tak tersedia/gagal — logout tetap lanjut normal.
  }
}

/** Tombol keluar gaya control-island dashboard: lingkaran 32px dengan glyph power. */
export function LogoutButton({ className = "" }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  return (
    <button
      type="button"
      onClick={async () => {
        await clearServiceWorkerCaches();
        signOut({ callbackUrl: "/login" });
      }}
      title="Keluar"
      aria-label="Keluar"
      className={`w-[32px] h-[32px] rounded-full flex items-center justify-center text-sm transition-colors hover:bg-red-500/10 ${className}`}
      style={{ color: isDark ? "rgba(255,255,255,0.3)" : "rgba(30,27,75,0.28)" }}
    >
      ⏻
    </button>
  );
}
