"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { currentStripeMode } from "@/lib/payments/stripe-mode";
import { getStripe } from "@/lib/payments/stripe";
import { getPaymentAccount } from "@/lib/queries/payments";
import { getOrigin } from "@/lib/utils/url";

type ActionError = { error: string };

const orgIdSchema = z.string().uuid("Unknown organization.");

/** Anything Stripe rejects reads the same to the organizer: try again, and if
 *  it keeps failing it's ours to fix. Stripe's own messages name API objects
 *  and parameters, which is noise to an organizer and detail we shouldn't echo
 *  into the UI. */
const STRIPE_FAILED =
  "Stripe couldn't be reached just now. Please try again in a moment.";

/**
 * Guard shared by every payouts action: signed in, an admin of this org, and
 * this deployment has Stripe keys. Returns the validated org id and the mode,
 * or the error to hand straight back to the client.
 */
async function requireOrgAdminWithStripe(
  orgId: string,
): Promise<ActionError | { orgId: string; livemode: boolean }> {
  const parsed = orgIdSchema.safeParse(orgId);
  if (!parsed.success) return { error: "Unknown organization." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  // Defense in depth — link_payment_account enforces this again in the DB.
  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", parsed.data)
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (membership as { role?: string } | null)?.role;
  if (role !== "owner" && role !== "admin") {
    return { error: "Only an organization admin can set up payouts." };
  }

  const mode = currentStripeMode();
  if (!mode.configured) {
    return {
      error:
        "Online payments aren't switched on yet. Check back once setup is finished.",
    };
  }

  return { orgId: parsed.data, livemode: mode.livemode };
}

/**
 * Start (or resume) Stripe Express onboarding for an org, returning a hosted
 * Stripe URL for the browser to visit.
 *
 * Two destinations behind one button, because the card's CTA changes with the
 * account's state: an organizer who hasn't finished gets an onboarding link,
 * and one who has ("Manage on Stripe") gets a login link to their Express
 * dashboard. Sending a finished organizer back through onboarding would be a
 * dead end.
 *
 * The account id is never taken from the client. It's read from the row RLS
 * already scopes to this org's admins, or minted here and handed to
 * link_payment_account, which is the only thing that decides what gets stored.
 */
export async function startPayoutsOnboardingAction(
  orgId: string,
): Promise<ActionError | { url: string }> {
  const guard = await requireOrgAdminWithStripe(orgId);
  if ("error" in guard) return guard;

  const stripe = getStripe();
  const origin = await getOrigin();
  const existing = await getPaymentAccount(guard.orgId);

  try {
    // Already through Stripe's form — send them to their own dashboard.
    if (existing?.detailsSubmitted) {
      const login = await stripe.accounts.createLoginLink(
        existing.stripeAccountId,
      );
      return { url: login.url };
    }

    const accountId = existing
      ? existing.stripeAccountId
      : await createConnectedAccount(guard.orgId, guard.livemode);
    if (typeof accountId !== "string") return accountId;

    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      // Stripe's links are single-use and short-lived. Both callbacks land back
      // on the org page: `refresh` means the link went stale before they
      // finished, and the card's CTA there mints a fresh one.
      refresh_url: `${origin}/orgs/${guard.orgId}?payouts=refresh`,
      return_url: `${origin}/orgs/${guard.orgId}?payouts=done`,
    });

    return { url: link.url };
  } catch {
    // Deliberately no error body in the log — Stripe errors echo back request
    // parameters, and for Connect that can include the organizer's details.
    console.error("[payments] stripe onboarding link failed");
    return { error: STRIPE_FAILED };
  }
}

/**
 * Create an Express account for an org and record it, returning the id the DB
 * settled on.
 *
 * The order matters. We create at Stripe first because link_payment_account
 * needs an id to store, then let the DB arbitrate: it returns the EXISTING id
 * if a second tab got there first, in which case the account we just made is
 * redundant and gets deleted. Deleting is best-effort — a leftover empty test
 * account is untidy, a wrong row in `payment_accounts` is an organizer's money
 * going to the wrong place.
 */
async function createConnectedAccount(
  orgId: string,
  livemode: boolean,
): Promise<string | ActionError> {
  const stripe = getStripe();
  const supabase = await createClient();

  const account = await stripe.accounts.create({
    type: "express",
    country: "CA",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { org_id: orgId },
  });

  const { data: storedId, error } = await supabase.rpc("link_payment_account", {
    _org_id: orgId,
    _stripe_account_id: account.id,
    _livemode: livemode,
  });

  if (error || typeof storedId !== "string") {
    console.error("[payments] link_payment_account failed");
    return { error: STRIPE_FAILED };
  }

  if (storedId !== account.id) {
    // Another tab won. Drop ours so it can't linger half-verified at Stripe.
    try {
      await stripe.accounts.del(account.id);
    } catch {
      console.error("[payments] could not delete redundant connected account");
    }
  }

  return storedId;
}
