import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  allowedDevOrigins: ["192.168.88.0/24"],
  transpilePackages: ["@3pb/kalkulator-core", "@3pb/ui"],
};

export default nextConfig;
