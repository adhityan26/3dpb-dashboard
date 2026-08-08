import { signOut } from "next-auth/react";

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

/**
 * Satu-satunya jalur logout client-side -- dipakai `LogoutButton` (header desktop) DAN sheet
 * "More" di `MobileBottomNav`. Sengaja BUKAN `logoutHref` bawaan komponen itu (link `<a>`
 * polos ke route) karena itu bakal skip clearServiceWorkerCaches() di atas.
 */
export async function performLogout(): Promise<void> {
  await clearServiceWorkerCaches();
  await signOut({ callbackUrl: "/login" });
}
