/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import { ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { rejectRedirectedOrErrorPlugin } from "@/lib/sw/reject-redirected-plugin";

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
// caching. Entry ini menangkap SEMUA full-document navigation
// (request.mode === "navigate") lebih dulu (first-match-wins) dan
// menolak cache lewat `rejectRedirectedOrErrorPlugin` (lihat
// lib/sw/reject-redirected-plugin.ts untuk detail + test), sebelum
// ...defaultCache sempat memprosesnya. Sengaja dibuat sempit (hanya
// navigate, bukan seluruh strategi) supaya offline-reopen untuk 4 route
// yang boleh di-cache tetap jalan.
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
          rejectRedirectedOrErrorPlugin,
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
