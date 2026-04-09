import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev HMR from local network IPs (so you can test on phone).
  // Only applies in dev mode — production builds ignore this.
  allowedDevOrigins: ["192.168.88.171", "192.168.88.0/24"],
};

export default nextConfig;
