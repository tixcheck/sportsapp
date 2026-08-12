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

/** One place to build the trusted client, so its inferred type is shareable. */
function createAdminClient(url: string, key: string) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type AdminClient = ReturnType<typeof createAdminClient>;

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

  if (
    event.type !== "account.updated" &&
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.expired"
  ) {
    // Everything else is a later slice's business. 200 keeps Stripe from
    // retrying an event we simply don't handle yet.
    return NextResponse.json({ received: true });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("[stripe-webhook] supabase secret key missing");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }
  const admin = createAdminClient(url, key);

  if (event.type === "checkout.session.completed") {
    return settleRegistrationPayment(
      admin,
      event.data.object as Stripe.Checkout.Session,
    );
  }

  if (event.type === "checkout.session.expired") {
    // Nobody paid and the link is dead. Retiring the row is what lets the team
    // start a fresh charge — the partial unique index allows only one open one.
    const expired = event.data.object as Stripe.Checkout.Session;
    await admin
      .from("registration_payments")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("stripe_checkout_session_id", expired.id)
      .eq("status", "pending");
    return NextResponse.json({ received: true });
  }

  const account = event.data.object as Stripe.Account;

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

/**
 * Mark a registration charge paid.
 *
 * Stripe is the authority on whether money moved, so we key off
 * `payment_status`, not the session merely being "complete" — a session can
 * complete with payment still processing, and calling that paid would confirm
 * a team that hasn't paid.
 *
 * Idempotent: the update is scoped to rows still `pending`, so Stripe's retries
 * (and its at-least-once delivery) settle the row exactly once.
 */
async function settleRegistrationPayment(
  admin: AdminClient,
  session: Stripe.Checkout.Session,
): Promise<Response> {
  if (session.payment_status !== "paid") {
    // Async payment methods land later via checkout.session.async_payment_*.
    // Acknowledging without writing keeps Stripe from retrying a non-event.
    return NextResponse.json({ received: true, ignored: "not yet paid" });
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  const { data, error } = await admin
    .from("registration_payments")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_checkout_session_id", session.id)
    .eq("status", "pending")
    .select("id");

  if (error) {
    // 500 so Stripe retries — a dropped payment would leave a team looking
    // unpaid after they have actually paid, which is the worst failure here.
    console.error("[stripe-webhook] registration payment update failed");
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }

  // No row updated means either an unknown session or a replay of one already
  // settled. Neither is an error worth making Stripe retry.
  return NextResponse.json({ received: true, settled: data?.length ?? 0 });
}
