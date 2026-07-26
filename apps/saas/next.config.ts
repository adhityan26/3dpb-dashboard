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
});

export default withSerwist(nextConfig);
