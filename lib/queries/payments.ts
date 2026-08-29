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
import {
  DEFAULT_PLATFORM_FEE_RATES,
  WAIVED_PLATFORM_FEE_RATES,
} from "@/lib/payments/platform-fee";

export type CompetitionPaymentSettings = {
  registrationFeeCents: number;
  /** What one free agent pays. 0 = individual sign-up is free. */
  individualFeeCents: number;
  /**
   * Where a team sends an e-transfer, or null when this event doesn't take
   * them. Presence of the address is what enables the option.
   */
  etransferEmail: string | null;
  /** Instructions shown beside the address. */
  etransferNote: string | null;
  allowCaptainPays: boolean;
  allowSplitPayment: boolean;
  taxEnabled: boolean;
  taxPercent: number;
  paymentRequired: boolean;
};

/** What an unpriced competition looks like — also the shape the form starts at. */
export const FREE_COMPETITION_PAYMENT_SETTINGS: CompetitionPaymentSettings = {
  registrationFeeCents: 0,
  individualFeeCents: 0,
  etransferEmail: null,
  etransferNote: null,
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
      "registration_fee_cents, individual_fee_cents, etransfer_email, etransfer_note, allow_captain_pays, allow_split_payment, tax_enabled, tax_percent, payment_required",
    )
    .eq("competition_id", competitionId)
    .maybeSingle();
  if (!data) return FREE_COMPETITION_PAYMENT_SETTINGS;

  const r = data as {
    registration_fee_cents: number;
    individual_fee_cents: number | null;
    etransfer_email: string | null;
    etransfer_note: string | null;
    allow_captain_pays: boolean;
    allow_split_payment: boolean;
    tax_enabled: boolean;
    tax_percent: string | number;
    payment_required: boolean;
  };
  return {
    registrationFeeCents: r.registration_fee_cents,
    individualFeeCents: r.individual_fee_cents ?? 0,
    etransferEmail: r.etransfer_email,
    etransferNote: r.etransfer_note,
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

/**
 * The rates that apply to ONE competition.
 *
 * The same global rates as everyone else, unless a platform admin has waived
 * the fee for this event — a free run while the platform is being promoted.
 * Returns zeroed rates in that case, so every fee calculation downstream comes
 * out at zero without knowing the waiver exists.
 *
 * Fails toward CHARGING: an unreadable competition row falls back to the global
 * rates. Silently waiving because a read failed would hand the platform's fee
 * to nobody and nobody would notice.
 */
export async function getPlatformFeeRatesFor(
  competitionId: string,
): Promise<PlatformFeeRates> {
  const supabase = await createClient();
  const [rates, { data }] = await Promise.all([
    getPlatformFeeRates(),
    supabase
      .from("competitions")
      .select("platform_fee_waived")
      .eq("id", competitionId)
      .maybeSingle(),
  ]);
  return (data as { platform_fee_waived: boolean } | null)?.platform_fee_waived
    ? WAIVED_PLATFORM_FEE_RATES
    : rates;
}

export type TeamPaymentRow = {
  status: "pending" | "paid" | "cancelled" | "refunded";
  kind: "team_full" | "player_share";
  payerEmail: string | null;
  priceCents: number;
  totalCents: number;
  refundedCents: number;
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
    .select(
      "status, kind, payer_email, price_cents, total_cents, refunded_cents",
    )
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
      refunded_cents: number;
    }[]
  ).map((r) => ({
    status: r.status,
    kind: r.kind,
    payerEmail: r.payer_email,
    priceCents: r.price_cents,
    totalCents: r.total_cents,
    refundedCents: r.refunded_cents,
  }));
}

export type MyPayment = {
  id: string;
  status: "pending" | "paid" | "cancelled" | "refunded";
  kind: "team_full" | "player_share";
  totalCents: number;
  priceCents: number;
  taxCents: number;
  /** How much of `totalCents` has been handed back. */
  refundedCents: number;
  refundReason: string | null;
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
      "id, status, kind, total_cents, price_cents, tax_cents, refunded_cents, refund_reason, currency, paid_at, created_at, team_id, teams(name, competitions(name, type, slug))",
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
    refunded_cents: number;
    refund_reason: string | null;
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
    refundedCents: r.refunded_cents,
    refundReason: r.refund_reason,
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

// ---------------------------------------------------------------------------
// Organizer payments dashboard (Slice C)
// ---------------------------------------------------------------------------

import {
  competitionLedger,
  type CompetitionLedger,
  type LedgerCharge,
  type LedgerTeam,
} from "@/lib/payments/ledger";

const LEDGER_CHARGE_COLUMNS =
  "id, team_id, kind, status, payer_email, price_cents, tax_cents, application_fee_cents, total_cents, refunded_cents, paid_at, created_at, payer:users!registration_payments_payer_user_id_fkey(display_name)";

/**
 * Every team in a competition and what it has paid, rolled up for the
 * organizer.
 *
 * Two reads rather than one embedded query: a team with no charges must still
 * appear — those are precisely the teams an organizer is looking for — and an
 * inner join would drop them. Withdrawn teams are included so their history
 * stays visible; the ledger decides they owe nothing.
 *
 * Returns null when payments aren't configured, so callers can hide the panel
 * rather than render an empty dashboard that looks like "nobody has paid".
 */
export async function getCompetitionLedger(
  competitionId: string,
  { feeCents }: { feeCents: number },
): Promise<CompetitionLedger | null> {
  const mode = currentStripeMode();
  if (!mode.configured) return null;

  const supabase = await createClient();

  const [{ data: teamRows }, { data: chargeRows }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, status, admitted_unpaid_at")
      .eq("competition_id", competitionId),
    supabase
      .from("registration_payments")
      .select(LEDGER_CHARGE_COLUMNS)
      .eq("competition_id", competitionId)
      .eq("livemode", mode.livemode)
      .order("created_at", { ascending: true }),
  ]);

  if (!teamRows) return null;

  type ChargeRecord = {
    id: string;
    team_id: string;
    kind: LedgerCharge["kind"];
    status: LedgerCharge["status"];
    payer_email: string | null;
    price_cents: number;
    tax_cents: number;
    application_fee_cents: number;
    total_cents: number;
    refunded_cents: number;
    paid_at: string | null;
    created_at: string;
    payer: { display_name: string | null } | null;
  };

  const byTeam = new Map<string, LedgerCharge[]>();
  for (const raw of (chargeRows ?? []) as unknown as ChargeRecord[]) {
    const charge: LedgerCharge = {
      id: raw.id,
      kind: raw.kind,
      status: raw.status,
      payerEmail: raw.payer_email,
      payerName: raw.payer?.display_name ?? null,
      priceCents: raw.price_cents,
      taxCents: raw.tax_cents,
      applicationFeeCents: raw.application_fee_cents,
      totalCents: raw.total_cents,
      refundedCents: raw.refunded_cents,
      paidAt: raw.paid_at,
      createdAt: raw.created_at,
    };
    const list = byTeam.get(raw.team_id);
    if (list) list.push(charge);
    else byTeam.set(raw.team_id, [charge]);
  }

  const teams: LedgerTeam[] = (
    teamRows as {
      id: string;
      name: string;
      status: LedgerTeam["status"];
      admitted_unpaid_at: string | null;
    }[]
  ).map((t) => ({
    teamId: t.id,
    teamName: t.name,
    status: t.status,
    admittedUnpaid: t.admitted_unpaid_at !== null,
    charges: byTeam.get(t.id) ?? [],
  }));

  return competitionLedger({ teams, feeCents });
}

export type RefundablePayment = {
  id: string;
  competitionId: string;
  teamId: string;
  status: "pending" | "paid" | "cancelled" | "refunded";
  priceCents: number;
  taxCents: number;
  applicationFeeCents: number;
  totalCents: number;
  refundedCents: number;
  currency: string;
  stripePaymentIntentId: string | null;
  payerEmail: string | null;
};

/**
 * One charge, with the Stripe ids a refund needs.
 *
 * Read under RLS, so a caller who isn't the organizer or a team member gets
 * null and the action refuses before it ever reaches Stripe.
 */
export async function getRefundablePayment(
  paymentId: string,
): Promise<RefundablePayment | null> {
  const mode = currentStripeMode();
  if (!mode.configured) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("registration_payments")
    .select(
      "id, competition_id, team_id, status, price_cents, tax_cents, application_fee_cents, total_cents, refunded_cents, currency, stripe_payment_intent_id, payer_email",
    )
    .eq("id", paymentId)
    .eq("livemode", mode.livemode)
    .maybeSingle();
  if (!data) return null;

  const r = data as {
    id: string;
    competition_id: string;
    team_id: string;
    status: RefundablePayment["status"];
    price_cents: number;
    tax_cents: number;
    application_fee_cents: number;
    total_cents: number;
    refunded_cents: number;
    currency: string;
    stripe_payment_intent_id: string | null;
    payer_email: string | null;
  };
  return {
    id: r.id,
    competitionId: r.competition_id,
    teamId: r.team_id,
    status: r.status,
    priceCents: r.price_cents,
    taxCents: r.tax_cents,
    applicationFeeCents: r.application_fee_cents,
    totalCents: r.total_cents,
    refundedCents: r.refunded_cents,
    currency: r.currency,
    stripePaymentIntentId: r.stripe_payment_intent_id,
    payerEmail: r.payer_email,
  };
}

export type PendingEtransfer = {
  paymentId: string;
  teamId: string;
  teamName: string;
  payerEmail: string | null;
  /** What they were told to send. */
  expectedCents: number;
  requestedAt: string;
};

export type EtransferFeesOwed = { payments: number; feeCents: number };

/**
 * Transfers a team says they've sent but the organizer hasn't confirmed.
 *
 * This is the organizer's to-do list, and it is the only place an e-transfer
 * can be settled — there is no webhook, because the money moved between two
 * banks and nothing told us.
 */
export async function getPendingEtransfers(
  competitionId: string,
): Promise<PendingEtransfer[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("registration_payments")
    .select("id, team_id, payer_email, total_cents, created_at, teams(name)")
    .eq("competition_id", competitionId)
    .eq("method", "etransfer")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  return (
    (data ?? []) as unknown as {
      id: string;
      team_id: string;
      payer_email: string | null;
      total_cents: number;
      created_at: string;
      teams: { name: string } | null;
    }[]
  ).map((r) => ({
    paymentId: r.id,
    teamId: r.team_id,
    teamName: r.teams?.name ?? "Team",
    payerEmail: r.payer_email,
    expectedCents: r.total_cents,
    requestedAt: r.created_at,
  }));
}

/**
 * Platform fees owed on confirmed e-transfers.
 *
 * We never handled this money, so the fee couldn't be deducted at the time.
 * It's a debt, tracked so it can be settled rather than quietly waived — which
 * would make e-transfer the rational choice for every organizer.
 */
export async function getEtransferFeesOwed(
  competitionId: string,
): Promise<EtransferFeesOwed> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("etransfer_fees_owed", {
    _competition_id: competitionId,
  });
  const row = (data as { payments: number; fee_cents: number }[] | null)?.[0];
  return { payments: row?.payments ?? 0, feeCents: row?.fee_cents ?? 0 };
}
