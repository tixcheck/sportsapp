import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyWebhook } from "@/lib/auth/verify-webhook";
import { parseEmailHook, type EmailHookPayload } from "@/lib/auth/email-hook";
import { sendAuthAction } from "@/lib/email/send";
import type { EmailBrand } from "@/lib/email/templates/layout";

/**
 * Supabase Send Email Hook — we send the auth emails, not Supabase.
 *
 * The second sanctioned API route (CLAUDE.md: webhooks only), and it exists for
 * two things Supabase's own template cannot do. That template is ONE global
 * thing for the whole platform, so it can carry neither an organizer's logo nor
 * the name of the league the reader was half-way into joining. And its link
 * goes to Supabase's verify endpoint, which honours `redirect_to` only when
 * that URL sits in the project's Redirect URLs allow list and otherwise drops
 * the reader on the Site URL — which is exactly how a BVL captain ended up on
 * the marketing home page with no idea how to finish registering.
 *
 * Sending it ourselves means the link points straight at our own callback with
 * the token hash, so that allow list can no longer break the flow.
 *
 * THIS ROUTE IS ON THE CRITICAL PATH OF EVERY SIGN-UP. When the hook is enabled
 * and this fails, Supabase cannot send a confirmation at all and the sign-up
 * fails with it. So everything decorative degrades rather than throws: if the
 * branding lookup dies, the email still goes, unbranded. Only two things are
 * allowed to fail the request — a bad signature, and a send that did not send.
 */

// The signature covers the exact bytes sent, so the body must not be parsed or
// re-serialised before verification.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.SUPABASE_AUTH_HOOK_SECRET?.trim();
  if (!secret) {
    console.error("[supabase-email] SUPABASE_AUTH_HOOK_SECRET not set");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const body = await request.text();
  const verified = verifyWebhook(
    body,
    {
      id: request.headers.get("webhook-id"),
      timestamp: request.headers.get("webhook-timestamp"),
      signature: request.headers.get("webhook-signature"),
    },
    secret,
  );
  if (!verified.ok) {
    console.error("[supabase-email] rejected:", verified.reason);
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: EmailHookPayload;
  try {
    payload = JSON.parse(body) as EmailHookPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = parseEmailHook(payload, siteOrigin());
  if (!parsed) {
    console.error("[supabase-email] payload had no address or token");
    return NextResponse.json({ error: "unusable payload" }, { status: 400 });
  }

  const context = await lookupBranding(parsed.registrationSlug);

  const result = await sendAuthAction(parsed.to, {
    action: parsed.action,
    brand: context?.brand,
    contextName: context?.competitionName ?? null,
    actionUrl: parsed.actionUrl,
  });

  if (!result.sent) {
    // Tell Supabase it failed. It surfaces the failure to the user, who can try
    // again — far better than a silent success and an email that never arrives.
    console.error("[supabase-email] send failed:", result.reason);
    return NextResponse.json({ error: "send failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * The organizer and league behind a `/register/<slug>` destination.
 *
 * Read with the secret key because there is no user session on a webhook, and
 * a published competition's name and its organizer's logo are public anyway —
 * this reads exactly the two rows the public org page already serves to anyone.
 * Returns null on any problem: branding is a nicety, and an unbranded
 * confirmation email beats a failed sign-up.
 */
async function lookupBranding(slug: string | null): Promise<{
  brand: EmailBrand;
  competitionName: string;
} | null> {
  if (!slug) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;

  try {
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: comp } = await admin
      .from("competitions")
      .select("name, org_id")
      .eq("slug", slug)
      .maybeSingle();
    if (!comp) return null;
    const c = comp as { name: string; org_id: string };

    const { data: org } = await admin
      .from("organizations")
      .select("name, logo_url")
      .eq("id", c.org_id)
      .maybeSingle();
    if (!org) return null;
    const o = org as { name: string; logo_url: string | null };

    return {
      brand: { name: o.name, logoUrl: o.logo_url },
      competitionName: c.name,
    };
  } catch (err) {
    console.error(
      "[supabase-email] branding lookup failed:",
      err instanceof Error ? err.message : "unknown",
    );
    return null;
  }
}

/**
 * Always the configured canonical origin, never the request's own host: this
 * request comes from Supabase, so the host header is no guide to where the
 * reader should be sent back to.
 */
function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return (configured || "https://mysportsapp.ca").replace(/\/+$/, "");
}
