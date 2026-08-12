import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { getStripe } from "@/lib/payments/stripe";
import { currentStripeMode } from "@/lib/payments/stripe-mode";
import { accountUpdateFromStripe } from "@/lib/payments/account-sync";

/**
 * Stripe webhooks — the write path for `payment_accounts`.
 *
 * One of the two sanctioned API routes (CLAUDE.md: webhooks only). Nothing in
 * the app can update an organizer's capability flags: `payment_accounts` has a
 * SELECT policy and no other, so the row that says whether an organizer can be
 * paid moves only when Stripe says so. That's why this route — a trusted server
 * job like the digest cron — is allowed the Supabase secret key.
 *
 * Trust comes from the signature, never from the payload. We verify against
 * STRIPE_WEBHOOK_SECRET before reading a single field, then re-derive the flags
 * from the event's own account object.
 */

// The signature is computed over the exact bytes Stripe sent, so the body must
// not be parsed or re-serialised before verification.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const mode = currentStripeMode();
  if (!secret || !mode.configured) {
    // Not configured is not the caller's fault, but it is ours to notice.
    console.error("[stripe-webhook] not configured");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "unsigned" }, { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      body,
      signature,
      secret,
    );
  } catch {
    // A bad signature is either a misconfigured endpoint or someone probing.
    // Either way we tell Stripe nothing about why.
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  // A live event reaching a test deployment (or the reverse) means two
  // environments point at one endpoint. Acknowledge so Stripe stops retrying,
  // but never let it write — it would stamp the wrong livemode row.
  if (event.livemode !== mode.livemode) {
    return NextResponse.json({ received: true, ignored: "mode mismatch" });
  }

  if (event.type !== "account.updated") {
    // Everything else is a later slice's business. 200 keeps Stripe from
    // retrying an event we simply don't handle yet.
    return NextResponse.json({ received: true });
  }

  const account = event.data.object as Stripe.Account;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("[stripe-webhook] supabase secret key missing");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // onboarded_at is a milestone, so the existing value wins if it's already
  // set — see accountUpdateFromStripe.
  const { data: existing } = await admin
    .from("payment_accounts")
    .select("id, onboarded_at")
    .eq("stripe_account_id", account.id)
    .maybeSingle();

  if (!existing) {
    // An account we never linked — e.g. one created by a tab that lost the
    // link_payment_account race and was deleted. Nothing to update.
    return NextResponse.json({ received: true, ignored: "unknown account" });
  }

  const row = existing as { id: string; onboarded_at: string | null };
  const update = accountUpdateFromStripe(account, {
    existingOnboardedAt: row.onboarded_at,
    now: new Date().toISOString(),
  });

  const { error } = await admin
    .from("payment_accounts")
    .update(update)
    .eq("id", row.id);

  if (error) {
    // 500 so Stripe retries — a dropped account.updated would leave an
    // organizer stuck on a stale "unfinished" badge.
    console.error("[stripe-webhook] payment_accounts update failed");
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
