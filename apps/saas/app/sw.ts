/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import { ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// 4 halaman inti yang boleh di-cache (lihat Global Constraints) TIDAK perlu daftar
// eksplisit di sini — cukup kecualikan yang TIDAK boleh, sisanya jatuh ke defaultCache.
const EXCLUDED_PREFIXES = ["/login", "/admin", "/beli", "/api/"];

// Guard defensif untuk open question #2 (lihat plan Task 6 / Step 3): sudah
// diverifikasi langsung di source terpasang bahwa `defaultCache` dari
// @serwist/next TIDAK mengecualikan response yang di-redirect sebelum
// caching — plugin default-nya (`cacheOkAndOpaquePlugin`, di
// serwist/dist/chunks/printInstallDetails-*.js) hanya menolak cache kalau
// `response.status !== 200 && response.status !== 0`. Response hasil
// redirect (mis. sesi habis → middleware redirect ke /login → 200) TETAP
// `status === 200` di objek Response akhir (redirect diikuti otomatis oleh
// fetch()), jadi lolos begitu saja dan bisa ke-cache di bawah NetworkFirst.
// Entry ini menangkap SEMUA full-document navigation (request.mode ===
// "navigate") lebih dulu (first-match-wins) dan menolak cache kalau
// `response.redirected` true, sebelum ...defaultCache sempat memprosesnya.
// Sengaja dibuat sempit (hanya navigate, bukan seluruh strategi) supaya
// offline-reopen untuk 4 route yang boleh di-cache tetap jalan.
const REJECT_REDIRECTED_PLUGIN = {
  cacheWillUpdate: async ({ response }: { response: Response }) => (response.redirected ? null : response),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ sameOrigin, url }) =>
        sameOrigin && EXCLUDED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)),
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages-navigate",
        plugins: [
          REJECT_REDIRECTED_PLUGIN,
          new ExpirationPlugin({
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60,
            maxAgeFrom: "last-used",
          }),
        ],
        networkTimeoutSeconds: 10,
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
