import "server-only";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { sendWaitlistOffer } from "@/lib/email/send";
import { getOrigin } from "@/lib/utils/url";

/**
 * Offer the next spot in a queue and tell the team.
 *
 * Called when an organizer removes or withdraws a team. NOT a server action:
 * it used to be exported from a "use server" file, which made it a public
 * endpoint (security audit, 2026-10-30). The RPC is now organizer/cron only
 * too (0189).
 *
 * Called wherever a team leaves. Doing nothing is the common case — the queue
 * may be empty, or the spot may already be taken — so this is safe to call
 * unconditionally rather than guarded at every call site.
 */
export async function offerNextWaitlistSpot(
  competitionId: string,
  divisionId: string | null,
): Promise<{ offered: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("offer_next_waitlist_spot", {
    _competition_id: competitionId,
    _division_id: divisionId,
  });
  const entry = data as {
    id: string;
    team_name: string;
    contact_email: string;
    claim_token: string | null;
    offer_expires_at: string | null;
  } | null;

  if (error || !entry?.claim_token) return { offered: false };

  const [{ data: comp }, origin] = await Promise.all([
    supabase
      .from("competitions")
      .select("name, slug, org_id, organizations(name, contact_email)")
      .eq("id", competitionId)
      .maybeSingle(),
    getOrigin(),
  ]);
  const c = comp as unknown as {
    name: string;
    organizations: { name: string; contact_email: string | null } | null;
  } | null;

  // Best effort: the offer exists in the database either way, and the deadline
  // is already ticking. A mail outage must not silently un-offer a spot.
  await sendWaitlistOffer(
    entry.contact_email,
    {
      teamName: entry.team_name,
      competitionName: c?.name ?? "the league",
      organizerName: c?.organizations?.name ?? "the organizer",
      claimUrl: `${origin}/waitlist/claim/${entry.claim_token}`,
      expiresAt: entry.offer_expires_at ?? "",
    },
    c?.organizations?.contact_email ?? undefined,
  );

  const { data: paths } = await supabase
    .from("competitions")
    .select("slug, org_id")
    .eq("id", competitionId)
    .maybeSingle();
  if (paths) {
    revalidatePath(`/orgs/${paths.org_id}`);
    revalidatePath(`/register/${paths.slug}`);
  }
  return { offered: true };
}
