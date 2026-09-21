/**
 * Individual sign-ups an organizer removed (migration 0127).
 *
 * Deleting a sign-up cascades its payment rows, so this table is the only trace
 * that the person, and their fee, were ever there. Read under RLS: the select
 * policy is `is_org_admin`, so a captain or a player gets an empty list rather
 * than a named stranger's email and what they paid.
 */
import { createClient } from "@/lib/supabase/server";

export type RemovedSignup = {
  id: string;
  name: string;
  email: string | null;
  /** available / placed / pending_payment / withdrawn, as they were. */
  statusAtRemoval: string;
  /** Organizer's net after refunds — what they had actually collected. */
  paidCents: number;
  paymentCount: number;
  /** card / paypal / etransfer. Empty when they never paid. */
  paymentMethods: string[];
  note: string | null;
  removedAt: string;
};

export async function getRemovedSignups(
  competitionId: string,
): Promise<RemovedSignup[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("removed_signups")
    .select(
      "id, name, email, status_at_removal, paid_cents, payment_count, payment_methods, note, created_at",
    )
    .eq("competition_id", competitionId)
    .order("created_at", { ascending: false });

  return (
    (data ?? []) as {
      id: string;
      name: string;
      email: string | null;
      status_at_removal: string;
      paid_cents: number;
      payment_count: number;
      payment_methods: string[] | null;
      note: string | null;
      created_at: string;
    }[]
  ).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    statusAtRemoval: r.status_at_removal,
    paidCents: r.paid_cents,
    paymentCount: r.payment_count,
    paymentMethods: r.payment_methods ?? [],
    note: r.note,
    removedAt: r.created_at,
  }));
}
