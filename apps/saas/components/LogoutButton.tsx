"use client";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";

// Best-effort: bersihkan Cache Storage service worker sebelum logout, supaya shell
// halaman ber-auth yang di-cache (berisi email user) tak bisa dibuka lagi offline
// oleh orang lain yang pakai device yang sama setelah user ini keluar.
async function clearServiceWorkerCaches() {
  try {
    if (typeof caches === "undefined") return;
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
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
