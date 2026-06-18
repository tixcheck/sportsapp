import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only: allow the phone/LAN origins used to test against `next dev`, which
  // otherwise logs a cross-origin request warning. allowedDevOrigins matches
  // request hostnames (not CIDR ranges), so list each device IP you test from.
  // No effect on production.
  allowedDevOrigins: ["10.88.111.19"],
};

export default nextConfig;
