"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { currentStripeMode } from "@/lib/payments/stripe-mode";
import { getStripe } from "@/lib/payments/stripe";
import {
  getCompetitionPaymentSettings,
  getPaymentAccount,
  getPlatformFeeRates,
  getTeamPaymentRows,
} from "@/lib/queries/payments";
import { getTeamRoster } from "@/lib/queries/roster";
import { cardPaymentBlockedReason } from "@/lib/payments/account-status";
import {
  planEtransferCharge,
  planIndividualCharge,
  planMemberShares,
  planTeamCharge,
  teamPaymentState,
} from "@/lib/payments/registration-plan";
import { quotePayment } from "@/lib/payments/fees";
import {
  platformFeeCentsFor,
  type CompetitionType,
} from "@/lib/payments/platform-fee";
import { getOrigin } from "@/lib/utils/url";
import { formatCents } from "@/lib/payments/format";
import { sendEtransferInstructions } from "@/lib/email/send";

type ActionError = { error: string };

const idSchema = z.string().uuid();

/** Stripe's failures read the same to a payer: try again, and if it keeps
 *  failing it's ours to fix. Their messages name API parameters, which is
 *  noise to a captain trying to pay $480. */
const STRIPE_FAILED =
  "We couldn't reach Stripe just now. Please try again in a moment.";

/**
 * Send a team's captain to Stripe Checkout to pay the registration fee in full.
 *
 * The amounts are recomputed here from the competition's stored settings and
 * the live platform rates — never taken from the client. The UI quotes the
 * same numbers through the same pure functions, so what the captain saw is what
 * they're charged, but the server is the one that decides.
 *
 * Idempotent: `start_registration_payment` returns the EXISTING open charge if
 * there is one, so a double-clicked button resumes the same session rather than
 * billing twice. If we lose that race we expire the session we just made.
 */
export async function startRegistrationCheckoutAction(
  competitionId: string,
  teamId: string,
): Promise<ActionError | { url: string }> {
  const comp = idSchema.safeParse(competitionId);
  const team = idSchema.safeParse(teamId);
  if (!comp.success || !team.success) return { error: "Unknown team." };

  const mode = currentStripeMode();
  if (!mode.configured) {
    return { error: "Online payments aren't switched on yet." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in to pay." };

  // The competition tells us how to price this; the org tells us where the
  // money goes. Both are read server-side under RLS.
  const { data: competition } = await supabase
    .from("competitions")
    .select("id, org_id, type, name")
    .eq("id", comp.data)
    .maybeSingle();
  if (!competition) return { error: "Unknown competition." };
  const c = competition as {
    id: string;
    org_id: string;
    type: CompetitionType;
    name: string;
  };

  const [settings, rates, account] = await Promise.all([
    getCompetitionPaymentSettings(c.id),
    getPlatformFeeRates(),
    getPaymentAccount(c.org_id),
  ]);

  if (settings.registrationFeeCents <= 0) {
    return { error: "This event is free — there's nothing to pay." };
  }
  if (!settings.allowCaptainPays) {
    return {
      error: "This event asks each player to pay their own share.",
    };
  }
  // `!account` is redundant against the reason (a null account is never
  // payable) but narrows the type for everything below.
  const blocked = cardPaymentBlockedReason(account);
  if (!account || blocked) {
    return {
      error:
        blocked ??
        "Card payment isn't available for this organizer at the moment.",
    };
  }

  const [charge] = planTeamCharge({
    pricing: {
      registrationFeeCents: settings.registrationFeeCents,
      taxEnabled: settings.taxEnabled,
      taxPercent: settings.taxPercent,
    },
    competitionType: c.type,
    rates,
  });
  if (!charge) return { error: "This event is free — there's nothing to pay." };

  const stripe = getStripe();
  const origin = await getOrigin();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Prefill so the receipt reaches the person actually paying.
      customer_email: user.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "cad",
            unit_amount: charge.totalCents,
            product_data: {
              name: `${c.name} — team registration`,
              description:
                charge.taxCents > 0
                  ? "Includes tax, card and platform fees."
                  : "Includes card and platform fees.",
            },
          },
        },
      ],
      payment_intent_data: {
        // A destination charge: Stripe settles to the organizer's connected
        // account and routes our cut to the platform in the same movement, so
        // the platform never holds the organizer's money.
        application_fee_amount: charge.applicationFeeCents,
        transfer_data: { destination: account.stripeAccountId },
      },
      // The webhook matches on the session id, but this makes a Stripe
      // dashboard row readable without cross-referencing our database.
      metadata: {
        competition_id: c.id,
        team_id: team.data,
        kind: "team_full",
      },
      success_url: `${origin}/teams/${team.data}?paid=1`,
      cancel_url: `${origin}/teams/${team.data}?paid=0`,
    });

    if (!session.url) {
      console.error("[payments] checkout session had no url");
      return { error: STRIPE_FAILED };
    }

    const { data: storedSessionId, error } = await supabase.rpc(
      "start_registration_payment",
      {
        _competition_id: c.id,
        _team_id: team.data,
        _kind: "team_full",
        _payer_email: null,
        _price_cents: charge.priceCents,
        _tax_cents: charge.taxCents,
        _platform_fee_cents: charge.platformFeeCents,
        _total_cents: charge.totalCents,
        _application_fee_cents: charge.applicationFeeCents,
        _stripe_account_id: account.stripeAccountId,
        _livemode: mode.livemode,
        _session_id: session.id,
      },
    );

    if (error || typeof storedSessionId !== "string") {
      // Our session is now orphaned; expiring it keeps the organizer's Stripe
      // dashboard from filling with sessions nobody can pay.
      await expireQuietly(session.id);
      const message = error?.message ?? "";
      if (message.includes("Only the team or the organizer")) {
        return { error: "Only the team or the organizer can pay this." };
      }
      console.error("[payments] start_registration_payment failed");
      return { error: STRIPE_FAILED };
    }

    if (storedSessionId !== session.id) {
      // Another tab already opened a charge. Use theirs and drop ours.
      await expireQuietly(session.id);
      const existing = await stripe.checkout.sessions.retrieve(storedSessionId);
      if (existing.status === "open" && existing.url) {
        return { url: existing.url };
      }
      // Their session is dead — retire the row so the next click starts clean.
      await supabase.rpc("cancel_registration_payment", {
        _session_id: storedSessionId,
      });
      return {
        error: "That payment link expired. Please try again.",
      };
    }

    return { url: session.url };
  } catch {
    console.error("[payments] checkout session create failed");
    return { error: STRIPE_FAILED };
  }
}

/**
 * Send a player to Stripe Checkout to pay their own share of a split team fee.
 *
 * The share is recomputed here from the current roster and the shares already
 * committed — never taken from the client. Recomputing matters: the roster can
 * change between the page rendering and the click, and the amount charged has
 * to be the one that keeps the team total right.
 *
 * An organizer may pay on a player's behalf by passing that player's email (an
 * org-added team, or cash taken at the door recorded here). Everyone else can
 * only pay their own share; `start_registration_payment` enforces the
 * team-membership half of that in the database.
 */
export async function startShareCheckoutAction(
  competitionId: string,
  teamId: string,
  payerEmail?: string,
): Promise<ActionError | { url: string }> {
  const comp = idSchema.safeParse(competitionId);
  const team = idSchema.safeParse(teamId);
  if (!comp.success || !team.success) return { error: "Unknown team." };

  const mode = currentStripeMode();
  if (!mode.configured) {
    return { error: "Online payments aren't switched on yet." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in to pay." };

  const { data: competition } = await supabase
    .from("competitions")
    .select("id, org_id, type, name")
    .eq("id", comp.data)
    .maybeSingle();
  if (!competition) return { error: "Unknown competition." };
  const c = competition as {
    id: string;
    org_id: string;
    type: CompetitionType;
    name: string;
  };

  const [settings, rates, account, rows, roster] = await Promise.all([
    getCompetitionPaymentSettings(c.id),
    getPlatformFeeRates(),
    getPaymentAccount(c.org_id),
    getTeamPaymentRows(team.data),
    getTeamRoster(team.data),
  ]);

  if (settings.registrationFeeCents <= 0) {
    return { error: "This event is free — there's nothing to pay." };
  }
  if (!settings.allowSplitPayment) {
    return { error: "This event asks the captain to pay the whole team fee." };
  }
  // `!account` is redundant against the reason (a null account is never
  // payable) but narrows the type for everything below.
  const blocked = cardPaymentBlockedReason(account);
  if (!account || blocked) {
    return {
      error:
        blocked ??
        "Card payment isn't available for this organizer at the moment.",
    };
  }

  // Default to the signed-in user's own share. A supplied email means an
  // organizer acting for someone else, so it has to be checked against admin
  // rights before we bill it.
  const target = (payerEmail ?? user.email ?? "").trim().toLowerCase();
  if (!target) {
    return { error: "We don't have an email to bill this share to." };
  }

  if (payerEmail && target !== (user.email ?? "").trim().toLowerCase()) {
    const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
      _competition_id: c.id,
    });
    if (isAdmin !== true) {
      return { error: "You can only pay your own share." };
    }
  }

  const shares = planMemberShares({
    pricing: {
      registrationFeeCents: settings.registrationFeeCents,
      taxEnabled: settings.taxEnabled,
      taxPercent: settings.taxPercent,
    },
    competitionType: c.type,
    rates,
    members: roster,
    existingShares: rows.filter((r) => r.kind === "player_share"),
  });

  const share = shares.find((s) => s.email.trim().toLowerCase() === target);
  if (!share) return { error: "You're not on this team's roster." };
  if (share.status === "paid") return { error: "That share is already paid." };
  if (share.priceCents <= 0) {
    return { error: "This team's fee is already covered." };
  }

  const platformFeeCents = platformFeeCentsFor({
    competitionType: c.type,
    payerMode: "player_share",
    chargeBaseCents: share.priceCents,
    rates,
  });
  const taxCents = settings.taxEnabled
    ? Math.round((share.priceCents * settings.taxPercent) / 100)
    : 0;
  const quote = quotePayment({
    priceCents: share.priceCents,
    platformFeeCents,
    taxCents,
  });

  const stripe = getStripe();
  const origin = await getOrigin();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: target,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "cad",
            unit_amount: quote.totalCents,
            product_data: {
              name: `${c.name} — your share`,
              description:
                taxCents > 0
                  ? "Includes tax, card and platform fees."
                  : "Includes card and platform fees.",
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: quote.applicationFeeCents,
        transfer_data: { destination: account.stripeAccountId },
      },
      metadata: {
        competition_id: c.id,
        team_id: team.data,
        kind: "player_share",
        payer_email: target,
      },
      success_url: `${origin}/teams/${team.data}?paid=1`,
      cancel_url: `${origin}/teams/${team.data}?paid=0`,
    });

    if (!session.url) {
      console.error("[payments] share checkout session had no url");
      return { error: STRIPE_FAILED };
    }

    const { data: storedSessionId, error } = await supabase.rpc(
      "start_registration_payment",
      {
        _competition_id: c.id,
        _team_id: team.data,
        _kind: "player_share",
        _payer_email: target,
        _price_cents: share.priceCents,
        _tax_cents: taxCents,
        _platform_fee_cents: platformFeeCents,
        _total_cents: quote.totalCents,
        _application_fee_cents: quote.applicationFeeCents,
        _stripe_account_id: account.stripeAccountId,
        _livemode: mode.livemode,
        _session_id: session.id,
      },
    );

    if (error || typeof storedSessionId !== "string") {
      await expireQuietly(session.id);
      const message = error?.message ?? "";
      if (message.includes("Only the team or the organizer")) {
        return { error: "Only the team or the organizer can pay this." };
      }
      console.error("[payments] start_registration_payment (share) failed");
      return { error: STRIPE_FAILED };
    }

    if (storedSessionId !== session.id) {
      await expireQuietly(session.id);
      const existing = await stripe.checkout.sessions.retrieve(storedSessionId);
      if (existing.status === "open" && existing.url) {
        return { url: existing.url };
      }
      await supabase.rpc("cancel_registration_payment", {
        _session_id: storedSessionId,
      });
      return { error: "That payment link expired. Please try again." };
    }

    return { url: session.url };
  } catch {
    console.error("[payments] share checkout session create failed");
    return { error: STRIPE_FAILED };
  }
}

/** Best-effort cleanup — a leftover open session is untidy, not dangerous. */
async function expireQuietly(sessionId: string): Promise<void> {
  try {
    await getStripe().checkout.sessions.expire(sessionId);
  } catch {
    console.error("[payments] could not expire redundant checkout session");
  }
}

/**
 * Settle whatever is left of a split fee in one payment.
 *
 * The case the plan calls out: a split team stalls at "$45 of $60" because one
 * teammate never pays. Without this the only exits are chasing that person
 * forever or refunding everyone who did pay — so the captain gets to cover the
 * remainder and confirm the team.
 *
 * Recorded as a `team_full` charge for the OUTSTANDING amount, not the whole
 * fee. `teamPaymentState` sums `price_cents` across every live row, so the paid
 * shares plus this remainder come to exactly the organizer's price — no
 * double-charging and no gap. The partial unique index allows one open
 * `team_full` charge, so a double-clicked button resumes the same session.
 *
 * The amount is recomputed here from the stored rows. A client-supplied
 * remainder could be forged, and the roster can change between the page
 * rendering and the click.
 */
export async function coverRemainingBalanceAction(
  competitionId: string,
  teamId: string,
): Promise<ActionError | { url: string }> {
  const comp = idSchema.safeParse(competitionId);
  const team = idSchema.safeParse(teamId);
  if (!comp.success || !team.success) return { error: "Unknown team." };

  const mode = currentStripeMode();
  if (!mode.configured) {
    return { error: "Online payments aren't switched on yet." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in to pay." };

  const { data: competition } = await supabase
    .from("competitions")
    .select("id, org_id, type, name")
    .eq("id", comp.data)
    .maybeSingle();
  if (!competition) return { error: "Unknown competition." };
  const c = competition as {
    id: string;
    org_id: string;
    type: CompetitionType;
    name: string;
  };

  const [settings, rates, account, rows] = await Promise.all([
    getCompetitionPaymentSettings(c.id),
    getPlatformFeeRates(),
    getPaymentAccount(c.org_id),
    getTeamPaymentRows(team.data),
  ]);

  if (settings.registrationFeeCents <= 0) {
    return { error: "This event is free — there's nothing to pay." };
  }
  // `!account` is redundant against the reason (a null account is never
  // payable) but narrows the type for everything below.
  const blocked = cardPaymentBlockedReason(account);
  if (!account || blocked) {
    return {
      error:
        blocked ??
        "Card payment isn't available for this organizer at the moment.",
    };
  }

  const state = teamPaymentState(rows, {
    feeCents: settings.registrationFeeCents,
  });
  const outstanding = state.outstandingPriceCents;
  if (outstanding <= 0) {
    return { error: "This team's fee is already covered." };
  }

  const platformFeeCents = platformFeeCentsFor({
    competitionType: c.type,
    payerMode: "captain_pays_team",
    chargeBaseCents: outstanding,
    rates,
  });
  const taxCents = settings.taxEnabled
    ? Math.round((outstanding * settings.taxPercent) / 100)
    : 0;
  const quote = quotePayment({
    priceCents: outstanding,
    platformFeeCents,
    taxCents,
  });

  const stripe = getStripe();
  const origin = await getOrigin();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "cad",
            unit_amount: quote.totalCents,
            product_data: {
              name: `${c.name} — remaining team balance`,
              description:
                taxCents > 0
                  ? "Covers what's left of the team fee. Includes tax, card and platform fees."
                  : "Covers what's left of the team fee. Includes card and platform fees.",
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: quote.applicationFeeCents,
        transfer_data: { destination: account.stripeAccountId },
      },
      metadata: {
        competition_id: c.id,
        team_id: team.data,
        kind: "team_full",
        covers: "remaining_balance",
      },
      success_url: `${origin}/teams/${team.data}?paid=1`,
      cancel_url: `${origin}/teams/${team.data}?paid=0`,
    });

    if (!session.url) {
      console.error("[payments] cover-rest session had no url");
      return { error: STRIPE_FAILED };
    }

    const { data: storedSessionId, error } = await supabase.rpc(
      "start_registration_payment",
      {
        _competition_id: c.id,
        _team_id: team.data,
        _kind: "team_full",
        _payer_email: null,
        _price_cents: outstanding,
        _tax_cents: taxCents,
        _platform_fee_cents: platformFeeCents,
        _total_cents: quote.totalCents,
        _application_fee_cents: quote.applicationFeeCents,
        _stripe_account_id: account.stripeAccountId,
        _livemode: mode.livemode,
        _session_id: session.id,
      },
    );

    if (error || typeof storedSessionId !== "string") {
      await expireQuietly(session.id);
      const message = error?.message ?? "";
      if (message.includes("Only the team or the organizer")) {
        return { error: "Only the team or the organizer can pay this." };
      }
      console.error(
        "[payments] start_registration_payment (cover-rest) failed",
      );
      return { error: STRIPE_FAILED };
    }

    if (storedSessionId !== session.id) {
      await expireQuietly(session.id);
      const existing = await stripe.checkout.sessions.retrieve(storedSessionId);
      if (existing.status === "open" && existing.url) {
        return { url: existing.url };
      }
      await supabase.rpc("cancel_registration_payment", {
        _session_id: storedSessionId,
      });
      return { error: "That payment link expired. Please try again." };
    }

    return { url: session.url };
  } catch {
    console.error("[payments] cover-rest session create failed");
    return { error: STRIPE_FAILED };
  }
}

/**
 * Send a free agent to Stripe Checkout to pay their own sign-up fee.
 *
 * Sibling of `startRegistrationCheckoutAction`, not a branch inside it: an
 * individual has no team, so the authorization question ("is this your own
 * sign-up?") and the price (`individualFeeCents`, at the per-player platform
 * rate) are both different. `start_individual_payment` enforces the
 * authorization half in the database.
 *
 * Idempotent the same way: an already-open charge is resumed rather than
 * duplicated, so a double-click never bills twice.
 */
export async function startIndividualCheckoutAction(
  competitionId: string,
  freeAgentId: string,
): Promise<ActionError | { url: string }> {
  const comp = idSchema.safeParse(competitionId);
  const agent = idSchema.safeParse(freeAgentId);
  if (!comp.success || !agent.success) return { error: "Unknown sign-up." };

  const mode = currentStripeMode();
  if (!mode.configured) {
    return { error: "Online payments aren't switched on yet." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in to pay." };

  const { data: competition } = await supabase
    .from("competitions")
    .select("id, org_id, type, name, slug")
    .eq("id", comp.data)
    .maybeSingle();
  if (!competition) return { error: "Unknown competition." };
  const c = competition as {
    id: string;
    org_id: string;
    type: CompetitionType;
    name: string;
    slug: string;
  };

  // RLS already limits this to the player's own row or an organizer's view, so
  // a miss here means "not yours", not "doesn't exist".
  const { data: freeAgent } = await supabase
    .from("free_agents")
    .select("id, email, status")
    .eq("id", agent.data)
    .eq("competition_id", c.id)
    .maybeSingle();
  if (!freeAgent) return { error: "Unknown sign-up." };
  const fa = freeAgent as { id: string; email: string; status: string };
  if (fa.status === "withdrawn") {
    return { error: "That sign-up was withdrawn." };
  }

  const [settings, rates, account] = await Promise.all([
    getCompetitionPaymentSettings(c.id),
    getPlatformFeeRates(),
    getPaymentAccount(c.org_id),
  ]);

  if (settings.individualFeeCents <= 0) {
    return { error: "Signing up as an individual is free — nothing to pay." };
  }
  // `!account` is redundant against the reason (a null account is never
  // payable) but narrows the type for everything below.
  const blocked = cardPaymentBlockedReason(account);
  if (!account || blocked) {
    return {
      error:
        blocked ??
        "Card payment isn't available for this organizer at the moment.",
    };
  }

  const [charge] = planIndividualCharge({
    pricing: {
      registrationFeeCents: settings.registrationFeeCents,
      individualFeeCents: settings.individualFeeCents,
      taxEnabled: settings.taxEnabled,
      taxPercent: settings.taxPercent,
    },
    competitionType: c.type,
    payerEmail: fa.email,
    rates,
  });
  if (!charge) {
    return { error: "Signing up as an individual is free — nothing to pay." };
  }

  const stripe = getStripe();
  const origin = await getOrigin();
  const backTo = `${origin}/register/${c.slug}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email ?? fa.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "cad",
            unit_amount: charge.totalCents,
            product_data: {
              name: `${c.name} — individual sign-up`,
              description:
                charge.taxCents > 0
                  ? "Includes tax, card and platform fees."
                  : "Includes card and platform fees.",
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: charge.applicationFeeCents,
        transfer_data: { destination: account.stripeAccountId },
      },
      metadata: {
        competition_id: c.id,
        free_agent_id: fa.id,
        kind: "individual",
      },
      success_url: `${backTo}?paid=1`,
      cancel_url: `${backTo}?paid=0`,
    });

    if (!session.url) {
      console.error("[payments] individual session had no url");
      return { error: STRIPE_FAILED };
    }

    const { data: storedSessionId, error } = await supabase.rpc(
      "start_individual_payment",
      {
        _competition_id: c.id,
        _free_agent_id: fa.id,
        _price_cents: charge.priceCents,
        _tax_cents: charge.taxCents,
        _platform_fee_cents: charge.platformFeeCents,
        _total_cents: charge.totalCents,
        _application_fee_cents: charge.applicationFeeCents,
        _stripe_account_id: account.stripeAccountId,
        _livemode: mode.livemode,
        _session_id: session.id,
      },
    );

    if (error || typeof storedSessionId !== "string") {
      await expireQuietly(session.id);
      if ((error?.message ?? "").includes("Only this player")) {
        return { error: "Only this player or the organizer can pay this." };
      }
      console.error("[payments] start_individual_payment failed");
      return { error: STRIPE_FAILED };
    }

    if (storedSessionId !== session.id) {
      // Another tab already opened a charge. Use theirs and drop ours.
      await expireQuietly(session.id);
      const existing = await stripe.checkout.sessions.retrieve(storedSessionId);
      if (existing.status === "open" && existing.url) {
        return { url: existing.url };
      }
      await supabase.rpc("cancel_registration_payment", {
        _session_id: storedSessionId,
      });
      return { error: "That payment link expired. Please try again." };
    }

    return { url: session.url };
  } catch {
    console.error("[payments] individual checkout create failed");
    return { error: STRIPE_FAILED };
  }
}

/**
 * Record that a team will pay the organizer directly, and tell them where.
 *
 * There is no checkout and no webhook — the money moves between two banks and
 * the organizer is the only witness. So this writes the obligation, returns the
 * address for the screen, and emails the same thing, because a bank transfer
 * gets done later from a phone rather than in the tab that's open now.
 *
 * The team stays `pending_payment` until the organizer confirms the money
 * arrived; nothing here makes them an entrant.
 */
export async function startEtransferAction(
  competitionId: string,
  teamId: string,
): Promise<
  | ActionError
  | { etransferEmail: string; amountCents: number; note: string | null }
> {
  const comp = idSchema.safeParse(competitionId);
  const team = idSchema.safeParse(teamId);
  if (!comp.success || !team.success) return { error: "Unknown team." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  const { data: competition } = await supabase
    .from("competitions")
    .select("id, org_id, type, name, slug")
    .eq("id", comp.data)
    .maybeSingle();
  if (!competition) return { error: "Unknown competition." };
  const c = competition as {
    id: string;
    org_id: string;
    type: CompetitionType;
    name: string;
    slug: string;
  };

  const [settings, rates] = await Promise.all([
    getCompetitionPaymentSettings(c.id),
    getPlatformFeeRates(),
  ]);

  if (!settings.etransferEmail) {
    return { error: "This event doesn't take e-transfers." };
  }
  if (settings.registrationFeeCents <= 0) {
    return { error: "This event is free — there's nothing to pay." };
  }

  const [charge] = planEtransferCharge({
    pricing: {
      registrationFeeCents: settings.registrationFeeCents,
      individualFeeCents: settings.individualFeeCents,
      taxEnabled: settings.taxEnabled,
      taxPercent: settings.taxPercent,
    },
    competitionType: c.type,
    payerEmail: user.email ?? null,
    rates,
  });
  if (!charge) return { error: "This event is free — there's nothing to pay." };

  const { error } = await supabase.rpc("start_etransfer_payment", {
    _competition_id: c.id,
    _team_id: team.data,
    _price_cents: charge.priceCents,
    _tax_cents: charge.taxCents,
    _platform_fee_cents: charge.platformFeeCents,
    _total_cents: charge.totalCents,
  });
  if (error) {
    if (error.message.includes("Only the team or the organizer")) {
      return { error: "Only the team or the organizer can do that." };
    }
    console.error("[payments] start_etransfer_payment failed");
    return { error: "That couldn't be recorded. Please try again." };
  }

  // Best effort, and deliberately after the write: the obligation existing is
  // what matters, and a mail outage must not lose a registration. The address
  // is on screen either way.
  const [{ data: org }, { data: teamRow }, origin] = await Promise.all([
    supabase
      .from("organizations")
      .select("name, contact_email")
      .eq("id", c.org_id)
      .maybeSingle(),
    supabase.from("teams").select("name").eq("id", team.data).maybeSingle(),
    getOrigin(),
  ]);

  if (user.email) {
    await sendEtransferInstructions(
      user.email,
      {
        teamName: (teamRow as { name: string } | null)?.name ?? "Your team",
        competitionName: c.name,
        organizerName:
          (org as { name: string } | null)?.name ?? "the organizer",
        etransferEmail: settings.etransferEmail,
        amount: formatCents(charge.totalCents),
        note: settings.etransferNote,
        teamUrl: `${origin}/teams/${team.data}`,
      },
      (org as { contact_email: string | null } | null)?.contact_email ??
        undefined,
    );
  }

  return {
    etransferEmail: settings.etransferEmail,
    amountCents: charge.totalCents,
    note: settings.etransferNote,
  };
}
