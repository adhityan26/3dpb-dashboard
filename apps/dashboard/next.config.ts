import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker deployment — produces a self-contained server.js
  output: "standalone",

  // Monorepo (pnpm workspace): pin the tracing root to the repo root two dirs up.
  // Without this, Next.js infers the root from traced file paths, which — because
  // pnpm's global content-addressable store lives outside the repo (e.g.
  // ~/Library/pnpm/store or /root/.local/share/pnpm) — bubbles up to the nearest
  // common ancestor (the user's home dir) and pollutes .next/standalone with the
  // full absolute path prefix instead of a clean `apps/dashboard/` layout.
  outputFileTracingRoot: path.join(__dirname, "../.."),

  // Allow dev HMR from local network IPs (only applies in dev mode).
  allowedDevOrigins: ["192.168.88.0/24"],

  // Transpile workspace packages that ship untranspiled TS source.
  transpilePackages: ["@3pb/kalkulator-core"],
};

export default nextConfig;
