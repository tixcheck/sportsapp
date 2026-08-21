"use server";

import { revalidatePath } from "next/cache";
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

// ---------------------------------------------------------------------------
// Registration fees (Slice B)
// ---------------------------------------------------------------------------

/**
 * Money arrives from the form in DOLLARS (what the organizer typed) and is
 * stored in CENTS. Doing that conversion here, once, at the trust boundary,
 * keeps every layer below this dealing in integers.
 */
const registrationFeeSchema = z
  .object({
    // 4 digits of dollars is a $9,999 ceiling — far above any real team fee,
    // and low enough that a typo'd extra zero is caught rather than charged.
    feeDollars: z
      .number()
      .min(0, "A fee can't be negative.")
      .max(9_999, "That's higher than any real registration fee.")
      .multipleOf(0.01, "Fees are in whole cents."),
    allowCaptainPays: z.boolean(),
    allowSplitPayment: z.boolean(),
    taxEnabled: z.boolean(),
    taxPercent: z
      .number()
      .min(0, "Tax can't be negative.")
      .max(100, "Tax can't exceed 100%."),
    paymentRequired: z.boolean(),
    /**
     * Where a team sends an e-transfer. Empty means this event doesn't take
     * them — the address IS the switch, so there's no second flag that can
     * disagree with it.
     */
    etransferEmail: z
      .string()
      .trim()
      .max(200)
      .refine((v) => v === "" || /^[^@s]+@[^@s]+$/.test(v), {
        message: "That doesn't look like an email address.",
      })
      .optional(),
    /** "Put your team name in the message." */
    etransferNote: z.string().trim().max(500).optional(),
  })
  .refine(
    (v) =>
      v.feeDollars === 0 ||
      v.allowCaptainPays ||
      v.allowSplitPayment ||
      !!v.etransferEmail,
    {
      message: "Pick at least one way for teams to pay.",
      path: ["allowCaptainPays"],
    },
  );

export type RegistrationFeeInput = z.infer<typeof registrationFeeSchema>;

/**
 * Set (or clear) a competition's registration fee.
 *
 * Upsert rather than insert: the row is created lazily the first time an
 * organizer prices an event, so every competition that predates payments has
 * no row and reads as free.
 *
 * Authorization is `is_competition_admin` in the DB — the same check the RLS
 * write policy applies — with this call as defense in depth.
 */
export async function updateRegistrationFeeAction(
  competitionId: string,
  values: RegistrationFeeInput,
): Promise<ActionError | { success: true }> {
  const id = z.string().uuid().safeParse(competitionId);
  if (!id.success) return { error: "Unknown competition." };

  const parsed = registrationFeeSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid settings." };
  }

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: id.data,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can change this." };
  }

  // Round rather than truncate: 12.005 typed into a dollars field should
  // become 1201, not 1200. The zod multipleOf already rejects sub-cent input,
  // so this only cleans up float representation error (12.34 * 100 = 1233.9999).
  const feeCents = Math.round(parsed.data.feeDollars * 100);

  const { error } = await supabase.from("competition_payment_settings").upsert(
    {
      competition_id: id.data,
      registration_fee_cents: feeCents,
      allow_captain_pays: parsed.data.allowCaptainPays,
      allow_split_payment: parsed.data.allowSplitPayment,
      tax_enabled: parsed.data.taxEnabled,
      tax_percent: parsed.data.taxEnabled ? parsed.data.taxPercent : 0,
      payment_required: feeCents === 0 ? false : parsed.data.paymentRequired,
      etransfer_email: parsed.data.etransferEmail || null,
      etransfer_note: parsed.data.etransferNote || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "competition_id" },
  );
  if (error) {
    console.error("[payments] registration fee upsert failed");
    return { error: "Couldn't save the fee. Please try again." };
  }

  revalidatePath("/orgs");
  return { success: true };
}
