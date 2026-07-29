import { headers } from "next/headers";

/**
 * The app's canonical production origin. Links generated OUTSIDE an interactive
 * request — above all the weekly-digest cron's emails — must use this: a Vercel
 * cron invokes the deployment directly, so the request host is the ephemeral
 * `*.vercel.app` build URL (e.g. sportsapp-hvncffv7x-…), which must never end up
 * in a link we send to users. Override per environment with NEXT_PUBLIC_SITE_URL.
 */
const CANONICAL_URL = "https://mysportsapp.ca";

function configuredSiteUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : null;
}

/**
 * Absolute origin for building links (auth redirects, email buttons, claim
 * URLs). Prefers an explicitly configured NEXT_PUBLIC_SITE_URL; otherwise uses
 * the incoming request host — except when that host is missing or an ephemeral
 * Vercel deployment URL (the cron case), where it falls back to the canonical
 * domain so we never email a build-specific link.
 */
export async function getOrigin(): Promise<string> {
  const configured = configuredSiteUrl();
  if (configured) return configured;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host || host.endsWith(".vercel.app")) {
    return process.env.NODE_ENV === "production"
      ? CANONICAL_URL
      : "http://localhost:3000";
  }
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
