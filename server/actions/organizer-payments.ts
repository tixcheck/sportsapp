"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { currentStripeMode } from "@/lib/payments/stripe-mode";
import { getStripe } from "@/lib/payments/stripe";
import {
  getCompetitionPaymentSettings,
  getRefundablePayment,
  getTeamPaymentRows,
} from "@/lib/queries/payments";
import { refundBreakdown, refundableCents } from "@/lib/payments/refunds";
import { teamPaymentState } from "@/lib/payments/registration-plan";
import { formatCents } from "@/lib/payments/format";
import { sendPaymentRequest } from "@/lib/email/send";
import { getOrigin } from "@/lib/utils/url";

type ActionError = { error: string };
type ActionOk = { ok: true };

const idSchema = z.string().uuid();

const STRIPE_FAILED =
  "Stripe couldn't be reached just now. Please try again in a moment.";

/**
 * Confirm the caller administers the competition a team belongs to.
 *
 * Every action here is organizer-only, and each one also has a database-side
 * check (a SECURITY DEFINER function, or RLS on the row it reads). This is the
 * defense-in-depth layer CLAUDE.md asks for — it gives a readable error instead
 * of a raised Postgres exception, but it is never the only thing standing in
 * the way.
 */
async function requireCompetitionAdmin(competitionId: string): Promise<
  | ActionError
  | {
      orgId: string;
      slug: string;
      type: string;
      name: string;
      orgName: string;
      orgEmail: string | null;
    }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only an organizer can do that." };
  }

  const { data: comp } = await supabase
    .from("competitions")
    .select("org_id, slug, type, name, organizations(name, contact_email)")
    .eq("id", competitionId)
    .maybeSingle();
  if (!comp) return { error: "Unknown competition." };

  const c = comp as unknown as {
    org_id: string;
    slug: string;
    type: string;
    name: string;
    organizations: { name: string; contact_email: string | null } | null;
  };
  return {
    orgId: c.org_id,
    slug: c.slug,
    type: c.type,
    name: c.name,
    // "Sent by" in the email means the organization running the event, not the
    // event itself.
    orgName: c.organizations?.name ?? "The organizer",
    orgEmail: c.organizations?.contact_email ?? null,
  };
}

/** Refresh every page that shows a team's payment position. */
function revalidateCompetition(
  { orgId, slug, type }: { orgId: string; slug: string; type: string },
  teamId?: string,
): void {
  revalidatePath(`/orgs/${orgId}`);
  revalidatePath(`/${type === "league" ? "l" : "t"}/${slug}`);
  if (teamId) revalidatePath(`/teams/${teamId}`);
}

// ---------------------------------------------------------------------------
// Admit a team that hasn't paid in full
// ---------------------------------------------------------------------------

const admitSchema = z.object({
  teamId: idSchema,
  note: z
    .string()
    .trim()
    .max(280, "Keep the note under 280 characters.")
    .optional(),
});

/**
 * Let a team play despite an outstanding balance.
 *
 * The debt is NOT cleared — the team keeps showing what it owes on the payments
 * dashboard. An organizer who takes cash at the door, or decides to carry a
 * team, needs them in the pools today and can settle the money later; making
 * "let them play" also mean "forget the money" would quietly erase receivables.
 */
export async function admitTeamUnpaidAction(
  input: z.input<typeof admitSchema>,
): Promise<ActionError | ActionOk> {
  const parsed = admitSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Unknown team." };
  }

  const supabase = await createClient();
  const { data: team } = await supabase
    .from("teams")
    .select("competition_id")
    .eq("id", parsed.data.teamId)
    .maybeSingle();
  if (!team) return { error: "Unknown team." };

  const comp = await requireCompetitionAdmin(
    (team as { competition_id: string }).competition_id,
  );
  if ("error" in comp) return comp;

  const { error } = await supabase.rpc("admit_team_unpaid", {
    _team_id: parsed.data.teamId,
    _note: parsed.data.note ?? null,
  });
  if (error) {
    console.error("[payments] admit_team_unpaid failed");
    return { error: "That team couldn't be admitted. Please try again." };
  }

  revalidateCompetition(comp, parsed.data.teamId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

const refundSchema = z.object({
  paymentId: idSchema,
  /** Omitted means refund everything still outstanding on the charge. */
  amountCents: z.number().int().positive().optional(),
  reason: z
    .string()
    .trim()
    .max(280, "Keep the reason under 280 characters.")
    .optional(),
});

/**
 * Hand money back to a payer.
 *
 * Two things make this safe. First, the amount is validated against the charge
 * read from OUR database, not from the client — a forged amount can't refund
 * more than was taken, and `refundBreakdown` throws rather than guessing.
 * Second, this does not write the refund down: Stripe is the authority on
 * whether money moved, so the `charge.refunded` webhook records it, exactly as
 * `checkout.session.completed` records the payment. If we wrote it here and the
 * refund later failed, our books would show money returned that never left.
 *
 * `reverse_transfer` and `refund_application_fee` mean the organizer and the
 * platform both give back their pro-rata share. Without them the refund would
 * come entirely out of the platform's balance — we'd be paying for the
 * organizer's refunds.
 */
export async function refundRegistrationPaymentAction(
  input: z.input<typeof refundSchema>,
): Promise<ActionError | { ok: true; refundedCents: number }> {
  const parsed = refundSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Unknown payment." };
  }

  const mode = currentStripeMode();
  if (!mode.configured) {
    return { error: "Online payments aren't switched on." };
  }

  const payment = await getRefundablePayment(parsed.data.paymentId);
  if (!payment) return { error: "Unknown payment." };

  const comp = await requireCompetitionAdmin(payment.competitionId);
  if ("error" in comp) return comp;

  if (!payment.stripePaymentIntentId) {
    return {
      error: "That payment has no Stripe charge to refund.",
    };
  }

  const available = refundableCents(payment);
  if (available <= 0) {
    return { error: "That payment has already been fully refunded." };
  }

  const amountCents = parsed.data.amountCents ?? available;
  let breakdown;
  try {
    breakdown = refundBreakdown(payment, amountCents);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "That refund amount isn't valid for this payment.",
    };
  }

  try {
    await getStripe().refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      amount: breakdown.refundCents,
      // Pull the organizer's and the platform's cuts back proportionally.
      reverse_transfer: true,
      refund_application_fee: true,
      metadata: {
        registration_payment_id: payment.id,
        competition_id: payment.competitionId,
        team_id: payment.teamId,
        // Carried on the Stripe object so the webhook can write the reason
        // without a second round trip to our database.
        reason: parsed.data.reason ?? "",
      },
    });
  } catch (err) {
    // Stripe's own message is the useful one here — "insufficient funds in the
    // connected account" is something the organizer can actually act on, and
    // unlike a checkout failure it isn't full of API parameter names.
    const message = err instanceof Error ? err.message : "";
    console.error("[payments] refund failed");
    return {
      error: message.includes("insufficient")
        ? "The organizer's Stripe balance is too low to cover this refund right now."
        : STRIPE_FAILED,
    };
  }

  revalidateCompetition(comp, payment.teamId);
  return { ok: true, refundedCents: breakdown.refundCents };
}

// ---------------------------------------------------------------------------
// Register a team on the organizer's behalf
// ---------------------------------------------------------------------------

const organizerRegisterSchema = z.object({
  competitionId: idSchema,
  divisionId: idSchema.nullable().optional(),
  teamName: z
    .string()
    .trim()
    .min(1, "Give the team a name.")
    .max(80, "Team names are 80 characters or fewer."),
  players: z
    .array(
      z.object({
        name: z.string().trim().max(80).optional(),
        email: z
          .string()
          .trim()
          .toLowerCase()
          .email("That email doesn't look right."),
      }),
    )
    .max(30, "That's more players than a team needs.")
    .default([]),
  paymentMode: z.enum(["team_full", "player_share"]).default("team_full"),
});

/**
 * Add a team the organizer took by phone, cash or spreadsheet.
 *
 * The first listed player is invited as CAPTAIN — the organizer isn't joining
 * the team, so somebody on it has to be able to manage it. On a paid event the
 * team lands as `pending_payment` and the organizer can send them a payment
 * link, which is the pairing this whole feature exists for.
 */
export async function organizerRegisterTeamAction(
  input: z.input<typeof organizerRegisterSchema>,
): Promise<ActionError | { ok: true; teamId: string }> {
  const parsed = organizerRegisterSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the team details.",
    };
  }

  const comp = await requireCompetitionAdmin(parsed.data.competitionId);
  if ("error" in comp) return comp;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("organizer_register_team", {
    _competition_id: parsed.data.competitionId,
    _division_id: parsed.data.divisionId ?? null,
    _team_name: parsed.data.teamName,
    _player_emails: parsed.data.players,
    _payment_mode: parsed.data.paymentMode,
  });

  if (error || typeof data !== "string") {
    // The function raises readable messages for the cases an organizer can fix
    // ("This event is full", "A team needs a name"), so pass those through.
    const message = error?.message ?? "";
    const readable =
      message.includes("full") ||
      message.includes("name") ||
      message.includes("division");
    return {
      error: readable
        ? message
        : "That team couldn't be added. Please try again.",
    };
  }

  revalidateCompetition(comp, data);
  return { ok: true, teamId: data };
}

// ---------------------------------------------------------------------------
// Send a payment link
// ---------------------------------------------------------------------------

const paymentLinkSchema = z.object({
  teamId: idSchema,
  /** Override the recipient; defaults to everyone who can pay this team's fee. */
  email: z.string().trim().toLowerCase().email().optional(),
});

/**
 * Email a team a link to finish paying.
 *
 * The link points at the TEAM PAGE, not at a Stripe Checkout URL. A Checkout
 * session expires within 24 hours, so an emailed one is dead by the time a
 * captain gets round to it; the team page mints a fresh session on click and
 * keeps working for as long as the fee is owed.
 *
 * Recipients come from the roster, never from the caller — an organizer
 * shouldn't be able to use this to email an arbitrary address, and the roster
 * is who owes the money anyway.
 */
export async function sendPaymentLinkAction(
  input: z.input<typeof paymentLinkSchema>,
): Promise<ActionError | { ok: true; sent: number }> {
  const parsed = paymentLinkSchema.safeParse(input);
  if (!parsed.success) return { error: "Unknown team." };

  const supabase = await createClient();
  const { data: team } = await supabase
    .from("teams")
    .select("id, name, competition_id, payment_mode")
    .eq("id", parsed.data.teamId)
    .maybeSingle();
  if (!team) return { error: "Unknown team." };

  const t = team as {
    id: string;
    name: string;
    competition_id: string;
    payment_mode: "team_full" | "player_share" | null;
  };

  const comp = await requireCompetitionAdmin(t.competition_id);
  if ("error" in comp) return comp;

  const [settings, rows] = await Promise.all([
    getCompetitionPaymentSettings(t.competition_id),
    getTeamPaymentRows(t.id),
  ]);

  if (settings.registrationFeeCents <= 0) {
    return { error: "This event is free — there's nothing to pay." };
  }

  const state = teamPaymentState(rows, {
    feeCents: settings.registrationFeeCents,
  });
  if (state.outstandingPriceCents <= 0) {
    return { error: "That team has already paid in full." };
  }

  // Everyone on the roster who could act on this. Invites are included: a team
  // the organizer just added has no members yet, only invited emails, and they
  // are exactly the people who need the link.
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from("team_members").select("users(email)").eq("team_id", t.id),
    supabase
      .from("team_invites")
      .select("email")
      .eq("team_id", t.id)
      .eq("status", "pending"),
  ]);

  const emails = new Set<string>();
  for (const m of (members ?? []) as unknown as {
    users: { email: string | null } | null;
  }[]) {
    const e = m.users?.email?.trim().toLowerCase();
    if (e) emails.add(e);
  }
  for (const i of (invites ?? []) as { email: string }[]) {
    const e = i.email?.trim().toLowerCase();
    if (e) emails.add(e);
  }

  if (parsed.data.email) {
    if (!emails.has(parsed.data.email)) {
      return { error: "That address isn't on this team." };
    }
    emails.clear();
    emails.add(parsed.data.email);
  }

  if (emails.size === 0) {
    return { error: "That team has nobody to email yet." };
  }

  const origin = await getOrigin();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const results = await Promise.all(
    [...emails].map((to) =>
      sendPaymentRequest(
        to,
        {
          competitionName: comp.name,
          teamName: t.name,
          outstanding: formatCents(state.outstandingPriceCents),
          when: comp.type === "league" ? "League play" : "Tournament",
          payUrl: `${origin}/teams/${t.id}`,
          mode: t.payment_mode ?? "team_full",
          organizerName: comp.orgName,
        },
        // Reply reaches the person who clicked send, falling back to the org's
        // published contact address.
        user?.email ?? comp.orgEmail ?? undefined,
      ),
    ),
  );

  const sent = results.filter((r) => r.sent).length;
  if (sent === 0) {
    return { error: "We couldn't send the email just now. Please try again." };
  }

  return { ok: true, sent };
}
