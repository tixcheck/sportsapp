import type { NextConfig } from "next";

/**
 * Security headers (security audit, 2026-10-30). Before this the app sent
 * none, so any site could load a signed-in page in a hidden frame and trick a
 * click on it (score entry, payments, organizer settings).
 *
 * `/embed/*` is the exception: those pages exist to be framed on league
 * websites, so they may be framed by anyone. Everything else only by the app.
 */
const everywhere = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  // Nothing in the app uses these; a script that sneaks in can't either.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self)",
  },
];

const noFraming = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
];

const nextConfig: NextConfig = {
  // Dev-only: allow the phone/LAN origins used to test against `next dev`, which
  // otherwise logs a cross-origin request warning. allowedDevOrigins matches
  // request hostnames (not CIDR ranges), so list each device IP you test from.
  // No effect on production.
  allowedDevOrigins: ["10.88.111.19"],
  async headers() {
    return [
      { source: "/:path*", headers: everywhere },
      { source: "/((?!embed/).*)", headers: noFraming },
    ];
  },
};

export default nextConfig;
