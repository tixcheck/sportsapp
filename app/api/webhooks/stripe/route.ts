import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { getStripe } from "@/lib/payments/stripe";
import { currentStripeMode } from "@/lib/payments/stripe-mode";
import { accountUpdateFromStripe } from "@/lib/payments/account-sync";
import { statusAfterRefund } from "@/lib/payments/refunds";
import { formatCents } from "@/lib/payments/format";
import { sendPaymentReceipt, sendPaymentRefund } from "@/lib/email/send";

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
    event.type !== "checkout.session.expired" &&
    event.type !== "charge.refunded"
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

  if (event.type === "charge.refunded") {
    return recordRefund(admin, event.data.object as Stripe.Charge);
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
    await releaseAbandonedTeam(admin, expired);
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
  const settled = data?.length ?? 0;
  if (settled > 0) {
    await confirmTeamIfPaid(admin, session);
    await admitFreeAgentIfPaid(admin, session);
    // After confirming, so the receipt can tell the payer whether the TEAM is
    // covered. Never allowed to fail the webhook — see sendReceipt.
    await sendReceipt(admin, session);
  }

  return NextResponse.json({ received: true, settled });
}

/**
 * Release a free agent into the pool once their own fee lands.
 *
 * The individual fee is a single charge for a single person, so unlike a team
 * there is no sum to reconcile — this payment IS the whole fee. That makes the
 * rule simple: paid means available for the organizer to place.
 *
 * Scoped to `pending_payment` so a replayed webhook can never resurrect
 * somebody who has since withdrawn or already been put on a team.
 */
async function admitFreeAgentIfPaid(
  admin: AdminClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const freeAgentId = session.metadata?.free_agent_id;
  if (!freeAgentId) return;

  const { error } = await admin
    .from("free_agents")
    .update({ status: "available", updated_at: new Date().toISOString() })
    .eq("id", freeAgentId)
    .eq("status", "pending_payment");

  if (error) {
    // Logged, not thrown: the money is already recorded, and failing the
    // webhook here would make Stripe retry a payment that did settle. The
    // organizer can admit them by hand from the free-agent list.
    console.error("[stripe-webhook] free agent admit failed");
  }
}

/**
 * Promote a `pending_payment` team to a real entrant once its fee is covered.
 *
 * "Covered" is measured against the organizer's price, not against a row count:
 * a split team is confirmed only when the shares add up, and an organizer who
 * accepts a partial payment can still confirm manually. Comparing sums is also
 * what makes this correct when the roster changed mid-collection.
 */
async function confirmTeamIfPaid(
  admin: AdminClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const teamId = session.metadata?.team_id;
  const competitionId = session.metadata?.competition_id;
  if (!teamId || !competitionId) return;

  const { data: team } = await admin
    .from("teams")
    .select("id, status")
    .eq("id", teamId)
    .maybeSingle();
  // Only a pending team needs promoting; anything else is already an entrant.
  if (!team || (team as { status: string }).status !== "pending_payment")
    return;

  const [{ data: settings }, { data: paid }] = await Promise.all([
    admin
      .from("competition_payment_settings")
      .select("registration_fee_cents")
      .eq("competition_id", competitionId)
      .maybeSingle(),
    admin
      .from("registration_payments")
      .select("price_cents")
      .eq("team_id", teamId)
      .eq("status", "paid"),
  ]);

  const feeCents =
    (settings as { registration_fee_cents?: number } | null)
      ?.registration_fee_cents ?? 0;
  const paidCents = ((paid ?? []) as { price_cents: number }[]).reduce(
    (sum, r) => sum + r.price_cents,
    0,
  );
  if (paidCents < feeCents) return; // still short — a split mid-collection

  const { error } = await admin
    .from("teams")
    .update({ status: "active", payment_mode: null })
    .eq("id", teamId)
    .eq("status", "pending_payment");
  if (error) console.error("[stripe-webhook] could not confirm team");
}

/**
 * Release a spot held by a team that never paid.
 *
 * Withdrawing rather than deleting keeps the trail — the organizer can see
 * someone tried — while freeing the spot, because capacity counts everything
 * that isn't withdrawn. Only ever touches a team with nothing paid or in
 * flight, so a split team part-way through collecting is left alone.
 */
async function releaseAbandonedTeam(
  admin: AdminClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const teamId = session.metadata?.team_id;
  if (!teamId) return;

  const { data: live } = await admin
    .from("registration_payments")
    .select("id")
    .eq("team_id", teamId)
    .in("status", ["paid", "pending"]);
  if ((live ?? []).length > 0) return;

  await admin
    .from("teams")
    .update({ status: "withdrawn" })
    .eq("id", teamId)
    .eq("status", "pending_payment");
}

/**
 * Record a refund that Stripe has actually made.
 *
 * The organizer's action asks Stripe for the refund; this writes it down. That
 * ordering is deliberate and matches how payments settle — believing our own
 * request would let a failed refund show in the ledger as money returned.
 *
 * `amount_refunded` is CUMULATIVE across every refund on the charge, so storing
 * it directly is naturally idempotent: Stripe's at-least-once delivery, and a
 * second partial refund, both land on the same correct number rather than
 * double-counting.
 *
 * Deliberately does NOT demote a confirmed team back to `pending_payment`. A
 * refund mid-season would otherwise silently pull a team out of pools,
 * schedules and standings — destructive, and never what a goodwill refund
 * means. The balance reappears on the payments dashboard and the organizer
 * decides whether to withdraw them.
 */
async function recordRefund(
  admin: AdminClient,
  charge: Stripe.Charge,
): Promise<Response> {
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null);
  if (!paymentIntentId) {
    return NextResponse.json({ received: true, ignored: "no payment intent" });
  }

  const { data: existing } = await admin
    .from("registration_payments")
    .select(
      "id, team_id, competition_id, total_cents, price_cents, tax_cents, application_fee_cents, refunded_cents, currency, payer_email, status",
    )
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (!existing) {
    // A charge we didn't create — e.g. an organizer refunding something from
    // Stripe's own dashboard that isn't a registration.
    return NextResponse.json({ received: true, ignored: "unknown charge" });
  }

  const row = existing as {
    id: string;
    team_id: string;
    competition_id: string;
    total_cents: number;
    price_cents: number;
    tax_cents: number;
    application_fee_cents: number;
    refunded_cents: number;
    currency: string;
    payer_email: string | null;
    status: "pending" | "paid" | "cancelled" | "refunded";
  };

  const refundedCents = charge.amount_refunded;
  if (refundedCents <= row.refunded_cents) {
    // A replay, or an event that arrived out of order behind a larger refund.
    return NextResponse.json({ received: true, ignored: "already recorded" });
  }

  const latest = charge.refunds?.data?.[0] ?? null;
  const reason =
    typeof latest?.metadata?.reason === "string" &&
    latest.metadata.reason.trim()
      ? latest.metadata.reason.trim()
      : null;

  const { error } = await admin
    .from("registration_payments")
    .update({
      refunded_cents: refundedCents,
      status: statusAfterRefund(
        {
          status: "paid",
          totalCents: row.total_cents,
          priceCents: row.price_cents,
          taxCents: row.tax_cents,
          applicationFeeCents: row.application_fee_cents,
          refundedCents: 0,
        },
        refundedCents,
      ),
      stripe_refund_id: latest?.id ?? null,
      refunded_at: new Date().toISOString(),
      ...(reason ? { refund_reason: reason } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (error) {
    // 500 so Stripe retries — an unrecorded refund shows the organizer money
    // they no longer have.
    console.error("[stripe-webhook] refund update failed");
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }

  await notifyRefund(
    admin,
    row,
    refundedCents - row.refunded_cents,
    reason,
    refundedCents >= row.total_cents,
  );

  return NextResponse.json({ received: true, refunded: refundedCents });
}

/** Tell the payer their money is coming back. Best-effort, like every send. */
async function notifyRefund(
  admin: AdminClient,
  row: {
    team_id: string;
    competition_id: string;
    payer_email: string | null;
    currency: string;
  },
  amountCents: number,
  reason: string | null,
  full: boolean,
): Promise<void> {
  if (!row.payer_email || amountCents <= 0) return;

  const [{ data: team }, { data: competition }] = await Promise.all([
    admin.from("teams").select("name").eq("id", row.team_id).maybeSingle(),
    admin
      .from("competitions")
      .select("name, organizations(name)")
      .eq("id", row.competition_id)
      .maybeSingle(),
  ]);

  const c = competition as unknown as {
    name?: string;
    organizations?: { name: string } | null;
  } | null;

  await sendPaymentRefund(row.payer_email, {
    competitionName: c?.name ?? "your event",
    teamName: (team as { name?: string } | null)?.name ?? "your team",
    amount: formatCents(amountCents, row.currency),
    full,
    reason,
    // The organization refunded them, not the tournament.
    organizerName: c?.organizations?.name ?? "The organizer",
  });
}

/**
 * Email the payer a receipt.
 *
 * Stripe sends its own card receipt, but that one can't answer the question a
 * captain actually has after paying a split fee — is the TEAM covered yet. Best
 * effort: a receipt that fails to send must never fail the webhook, because
 * that would make Stripe retry and re-settle a payment that already landed.
 */
async function sendReceipt(
  admin: AdminClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const { data: payment } = await admin
    .from("registration_payments")
    .select(
      "team_id, competition_id, kind, price_cents, tax_cents, application_fee_cents, total_cents, currency, payer_email, paid_at",
    )
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();
  if (!payment) return;

  const p = payment as {
    team_id: string;
    competition_id: string;
    kind: "team_full" | "player_share";
    price_cents: number;
    tax_cents: number;
    application_fee_cents: number;
    total_cents: number;
    currency: string;
    payer_email: string | null;
    paid_at: string | null;
  };

  const to = p.payer_email ?? session.customer_details?.email ?? null;
  if (!to) return;

  const [
    { data: team },
    { data: competition },
    { data: settings },
    { data: paid },
  ] = await Promise.all([
    admin.from("teams").select("name").eq("id", p.team_id).maybeSingle(),
    admin
      .from("competitions")
      .select("name, organizations(name)")
      .eq("id", p.competition_id)
      .maybeSingle(),
    admin
      .from("competition_payment_settings")
      .select("registration_fee_cents")
      .eq("competition_id", p.competition_id)
      .maybeSingle(),
    admin
      .from("registration_payments")
      .select("price_cents")
      .eq("team_id", p.team_id)
      .eq("status", "paid"),
  ]);

  const feeCents =
    (settings as { registration_fee_cents?: number } | null)
      ?.registration_fee_cents ?? 0;
  const collected = ((paid ?? []) as { price_cents: number }[]).reduce(
    (sum, r) => sum + r.price_cents,
    0,
  );
  const c = competition as unknown as {
    name?: string;
    organizations?: { name: string } | null;
  } | null;

  await sendPaymentReceipt(to, {
    competitionName: c?.name ?? "your event",
    teamName: (team as { name?: string } | null)?.name ?? "your team",
    total: formatCents(p.total_cents, p.currency),
    price: formatCents(p.price_cents, p.currency),
    tax: p.tax_cents > 0 ? formatCents(p.tax_cents, p.currency) : null,
    fees: formatCents(p.application_fee_cents, p.currency),
    paidOn: new Date(p.paid_at ?? Date.now()).toLocaleDateString("en-CA", {
      dateStyle: "medium",
    }),
    kind: p.kind,
    teamFullyPaid: feeCents > 0 && collected >= feeCents,
    teamUrl: `${canonicalOrigin()}/teams/${p.team_id}`,
    organizerName: c?.organizations?.name ?? "the organizer",
  });
}

/**
 * Origin for links in webhook-sent email.
 *
 * A webhook has no incoming user request to read a host from, so `getOrigin`'s
 * header path is unavailable — the same problem the digest cron has, solved the
 * same way.
 */
function canonicalOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return configured ? configured.replace(/\/+$/, "") : "https://mysportsapp.ca";
}
