import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker deployment — produces a self-contained server.js
  output: "standalone",

  // Allow dev HMR from local network IPs (only applies in dev mode).
  allowedDevOrigins: ["192.168.88.0/24"],
};

export default nextConfig;
