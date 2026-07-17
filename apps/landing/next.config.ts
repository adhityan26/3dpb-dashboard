import path from "path";
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "export",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@3pb/kalkulator-core", "@3pb/ui"],
  images: { unoptimized: true },
};
export default nextConfig;
