import { createClient } from "@/lib/supabase/server";
import type { ConnectAccountFlags } from "@/lib/payments/account-status";
import { currentStripeMode } from "@/lib/payments/stripe-mode";

export interface PaymentAccountRow extends ConnectAccountFlags {
  id: string;
  stripeAccountId: string;
  country: string;
  defaultCurrency: string;
  onboardedAt: string | null;
}

type PaymentAccountRecord = {
  id: string;
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  disabled_reason: string | null;
  requirements_due_count: number;
  country: string;
  default_currency: string;
  onboarded_at: string | null;
};

const COLUMNS =
  "id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted, disabled_reason, requirements_due_count, country, default_currency, onboarded_at";

/**
 * An org's connected account for the mode this deployment is running in, or
 * null. Scoped to the current Stripe mode on purpose: showing a test account's
 * "ready to take payments" badge on a live deployment would be a lie, and RLS
 * already limits the read to the org's own admins.
 */
export async function getPaymentAccount(
  orgId: string,
): Promise<PaymentAccountRow | null> {
  const mode = currentStripeMode();
  if (!mode.configured) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("payment_accounts")
    .select(COLUMNS)
    .eq("org_id", orgId)
    .eq("livemode", mode.livemode)
    .maybeSingle();
  if (!data) return null;

  const r = data as PaymentAccountRecord;
  return {
    id: r.id,
    stripeAccountId: r.stripe_account_id,
    chargesEnabled: r.charges_enabled,
    payoutsEnabled: r.payouts_enabled,
    detailsSubmitted: r.details_submitted,
    disabledReason: r.disabled_reason,
    requirementsDueCount: r.requirements_due_count,
    country: r.country,
    defaultCurrency: r.default_currency,
    onboardedAt: r.onboarded_at,
  };
}

// ---------------------------------------------------------------------------
// Registration fees (Slice B)
// ---------------------------------------------------------------------------

import type { PlatformFeeRates } from "@/lib/payments/platform-fee";
import { DEFAULT_PLATFORM_FEE_RATES } from "@/lib/payments/platform-fee";

export type CompetitionPaymentSettings = {
  registrationFeeCents: number;
  allowCaptainPays: boolean;
  allowSplitPayment: boolean;
  taxEnabled: boolean;
  taxPercent: number;
  paymentRequired: boolean;
};

/** What an unpriced competition looks like — also the shape the form starts at. */
export const FREE_COMPETITION_PAYMENT_SETTINGS: CompetitionPaymentSettings = {
  registrationFeeCents: 0,
  allowCaptainPays: true,
  allowSplitPayment: false,
  taxEnabled: false,
  taxPercent: 0,
  paymentRequired: false,
};

/**
 * A competition's pricing, or the free-event defaults when no row exists.
 *
 * Rows are created lazily on first save, so "no row" is the normal state for
 * every competition that predates payments — it means free, not broken.
 */
export async function getCompetitionPaymentSettings(
  competitionId: string,
): Promise<CompetitionPaymentSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("competition_payment_settings")
    .select(
      "registration_fee_cents, allow_captain_pays, allow_split_payment, tax_enabled, tax_percent, payment_required",
    )
    .eq("competition_id", competitionId)
    .maybeSingle();
  if (!data) return FREE_COMPETITION_PAYMENT_SETTINGS;

  const r = data as {
    registration_fee_cents: number;
    allow_captain_pays: boolean;
    allow_split_payment: boolean;
    tax_enabled: boolean;
    tax_percent: string | number;
    payment_required: boolean;
  };
  return {
    registrationFeeCents: r.registration_fee_cents,
    allowCaptainPays: r.allow_captain_pays,
    allowSplitPayment: r.allow_split_payment,
    taxEnabled: r.tax_enabled,
    // numeric(5,3) arrives as a string from PostgREST.
    taxPercent: Number(r.tax_percent),
    paymentRequired: r.payment_required,
  };
}

/**
 * The platform's own fee rates.
 *
 * Falls back to the locked defaults if the singleton row is somehow unreadable:
 * a quote that silently used 0% would hand the platform's fee to nobody, and
 * these defaults are the same values the migration seeds.
 */
export async function getPlatformFeeRates(): Promise<PlatformFeeRates> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_fee_settings")
    .select(
      "tournament_percent, league_per_player_cents, league_per_team_cents",
    )
    .maybeSingle();
  if (!data) return DEFAULT_PLATFORM_FEE_RATES;

  const r = data as {
    tournament_percent: string | number;
    league_per_player_cents: number;
    league_per_team_cents: number;
  };
  return {
    tournamentPercent: Number(r.tournament_percent),
    leaguePerPlayerCents: r.league_per_player_cents,
    leaguePerTeamCents: r.league_per_team_cents,
  };
}

export type TeamPaymentRow = {
  status: "pending" | "paid" | "cancelled" | "refunded";
  kind: "team_full" | "player_share";
  payerEmail: string | null;
  priceCents: number;
  totalCents: number;
};

/** A team's payment rows — feeds both `teamPaymentState` and `planMemberShares`. */
export async function getTeamPaymentRows(
  teamId: string,
): Promise<TeamPaymentRow[]> {
  const mode = currentStripeMode();
  if (!mode.configured) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("registration_payments")
    .select("status, kind, payer_email, price_cents, total_cents")
    .eq("team_id", teamId)
    // Test-mode rows must never colour a live deployment's status, and vice
    // versa — the same reason payment_accounts keys on livemode.
    .eq("livemode", mode.livemode);
  if (!data) return [];

  return (
    data as {
      status: TeamPaymentRow["status"];
      kind: TeamPaymentRow["kind"];
      payer_email: string | null;
      price_cents: number;
      total_cents: number;
    }[]
  ).map((r) => ({
    status: r.status,
    kind: r.kind,
    payerEmail: r.payer_email,
    priceCents: r.price_cents,
    totalCents: r.total_cents,
  }));
}

export type MyPayment = {
  id: string;
  status: "pending" | "paid" | "cancelled" | "refunded";
  kind: "team_full" | "player_share";
  totalCents: number;
  priceCents: number;
  taxCents: number;
  currency: string;
  paidAt: string | null;
  createdAt: string;
  teamId: string;
  teamName: string;
  competitionName: string;
  competitionType: "league" | "tournament" | "kotc";
  competitionSlug: string;
};

/**
 * Everything the signed-in user has paid or been asked to pay.
 *
 * Matched on payer_user_id, set when the charge is created (migration 0067).
 * Deliberately NOT matched on team membership: a captain who paid for the team
 * should see that payment, but a teammate who paid nothing should not see it
 * listed as theirs.
 */
export async function getMyPayments(): Promise<MyPayment[]> {
  const mode = currentStripeMode();
  if (!mode.configured) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("registration_payments")
    .select(
      "id, status, kind, total_cents, price_cents, tax_cents, currency, paid_at, created_at, team_id, teams(name, competitions(name, type, slug))",
    )
    .eq("payer_user_id", user.id)
    .eq("livemode", mode.livemode)
    .order("created_at", { ascending: false });
  if (!data) return [];

  type Row = {
    id: string;
    status: MyPayment["status"];
    kind: MyPayment["kind"];
    total_cents: number;
    price_cents: number;
    tax_cents: number;
    currency: string;
    paid_at: string | null;
    created_at: string;
    team_id: string;
    teams: {
      name: string;
      competitions: {
        name: string;
        type: MyPayment["competitionType"];
        slug: string;
      } | null;
    } | null;
  };

  return (data as unknown as Row[]).map((r) => ({
    id: r.id,
    status: r.status,
    kind: r.kind,
    totalCents: r.total_cents,
    priceCents: r.price_cents,
    taxCents: r.tax_cents,
    currency: r.currency,
    paidAt: r.paid_at,
    createdAt: r.created_at,
    teamId: r.team_id,
    teamName: r.teams?.name ?? "Your team",
    competitionName: r.teams?.competitions?.name ?? "Event",
    competitionType: r.teams?.competitions?.type ?? "tournament",
    competitionSlug: r.teams?.competitions?.slug ?? "",
  }));
}
