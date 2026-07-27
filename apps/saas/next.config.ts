import path from "path";
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  allowedDevOrigins: ["192.168.88.0/24"],
  transpilePackages: ["@3pb/kalkulator-core", "@3pb/ui"],
  // @serwist/next attaches a webpack() hook unconditionally (even though it's a
  // no-op in dev via `disable` below), which Next 16's Turbopack dev server treats
  // as a hard conflict unless a `turbopack` key is explicitly present. `next dev`
  // stays on Turbopack (fast HMR); `next build --webpack` is what actually runs
  // Serwist's bundling, and doesn't consult this key at all.
  turbopack: {},
};

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  register: false,
  disable: process.env.NODE_ENV === "development",
  // /offline (app/sw.ts's fallbacks.entries target) must be explicitly precached —
  // the modern Serwist class does NOT auto-precache fallback URLs, it only serves
  // them from whatever's already in the precache. Without this, a cache-miss
  // navigation while offline fails outright instead of showing the fallback page
  // (found in final whole-branch review: /offline never actually rendered).
  additionalPrecacheEntries: ["/offline"],
});

export default withSerwist(nextConfig);
