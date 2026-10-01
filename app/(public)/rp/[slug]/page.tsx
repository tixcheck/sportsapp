import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { DateTime } from "luxon";

import { getReversePairsBySlug } from "@/lib/queries/reverse-pairs";
import { PartnerMatrixCard } from "@/components/reverse-pairs/partner-matrix";
import { ReversePairsStandingsCard } from "@/components/reverse-pairs/standings";
import { PublicReversePairsSchedule } from "@/components/reverse-pairs/public-schedule";
import { AutoRefresh } from "@/components/public/auto-refresh";
import { ReversePairsRegisterForm } from "@/components/reverse-pairs/register-form";
import { getCompetitionPaymentSettings } from "@/lib/queries/payments";
import { formatCents } from "@/lib/payments/format";
import { createClient } from "@/lib/supabase/server";
import { OrgTheme } from "@/components/branding/org-theme";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await getReversePairsBySlug(slug);
  return { title: event ? `${event.name} — Reverse Pairs` : "Reverse Pairs" };
}

export default async function PublicReversePairsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getReversePairsBySlug(slug);
  if (!event) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const fee = await getCompetitionPaymentSettings(event.competitionId);

  // Whose event this is, and how it should look: the organizer's banner, logo
  // and brand colours, the way their league registration page already shows
  // the first two.
  const { data: branding } = await supabase
    .from("competitions")
    .select(
      "banner_url, organizations(name, logo_url, brand_accent, brand_background, brand_secondary)",
    )
    .eq("id", event.competitionId)
    .maybeSingle();
  const org = (
    branding as unknown as {
      organizations: {
        name: string;
        logo_url: string | null;
        brand_accent: string | null;
        brand_background: string | null;
        brand_secondary: string | null;
      } | null;
    } | null
  )?.organizations;
  const bannerUrl =
    (branding as { banner_url: string | null } | null)?.banner_url ?? null;

  // Every pair holding a spot, paid or not — the cap counts both, so "spots
  // left" must too, or the form offers a place the database then refuses.
  const { data: holding } = await supabase
    .from("teams")
    .select("id, name, status, captain_user_id, name_is_auto")
    .eq("competition_id", event.competitionId)
    .neq("status", "withdrawn");
  const held = (holding ?? []) as {
    id: string;
    name: string;
    status: string;
    captain_user_id: string | null;
    name_is_auto: boolean;
  }[];
  const awaitingPayment = held.filter((t) => t.status === "pending_payment");
  // The viewer's own pair: registering again would only say "already
  // registered", so show them where their pair is instead.
  let mine = user ? held.find((t) => t.captain_user_id === user.id) : undefined;
  if (user && !mine) {
    const { data: member } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id)
      .in(
        "team_id",
        held.map((t) => t.id),
      )
      .limit(1)
      .maybeSingle();
    mine = held.find((t) => t.id === member?.team_id);
  }
  // A pair signed up alone is "Dani/TBD" until a partner is invited or joins.
  const needsPartner =
    !!mine && mine.name_is_auto && /\/TBD( \d+)?$/.test(mine.name);
  // The name the form will register them under, shown before they commit.
  const { data: me } = user
    ? await supabase
        .from("users")
        .select("display_name, email")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  const played = event.games.filter((g) => g.scoreA !== null).length;
  const first = event.games.find((g) => g.scheduledAt)?.scheduledAt ?? null;
  const day = first
    ? DateTime.fromISO(first, { zone: event.timezone }).toFormat(
        "cccc d LLLL yyyy",
      )
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <OrgTheme
        accent={org?.brand_accent}
        background={org?.brand_background}
        secondary={org?.brand_secondary}
      />
      {bannerUrl && (
        // `contain`, as on the registration page: organizers upload a crest as
        // often as a wide banner, and cropping one to fill shows its middle.
        <div className="bg-paper-sunken -mx-4 -mt-8 flex justify-center sm:mx-0 sm:mt-0 sm:rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element -- external URL, no loader configured */}
          <img
            src={bannerUrl}
            alt=""
            className="h-56 w-auto max-w-full object-contain sm:h-72"
          />
        </div>
      )}
      {/* Scores land while people are standing on the sideline looking at this. */}
      <AutoRefresh intervalMs={60_000} />

      <header className="space-y-1">
        <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
          {event.name}
        </h1>
        <p className="text-muted-foreground text-sm">
          Reverse Pairs · {event.pairs.length} pair
          {event.pairs.length === 1 ? "" : "s"} · {event.settings.courts} court
          {event.settings.courts === 1 ? "" : "s"}
          {day && <> · {day}</>}
        </p>
        {org && (
          <div className="flex items-center gap-2">
            {org.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element -- external URL, no loader configured
              <img
                src={org.logo_url}
                alt=""
                className="size-7 rounded-full object-cover"
              />
            )}
            <p className="text-muted-foreground text-sm">
              Hosted by{" "}
              <span className="text-foreground font-medium">{org.name}</span>
            </p>
          </div>
        )}
        {event.venue && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <MapPin className="size-3.5" />
            {event.venue}
          </p>
        )}
      </header>

      {mine && (
        <div className="border-rule bg-surface flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <p className="text-sm">
            Your pair: <span className="font-semibold">{mine.name}</span>
            {mine.status === "pending_payment"
              ? " — not paid yet, so not in the draw."
              : " — you're in."}
            {needsPartner &&
              " No partner yet — invite one from your pair's page."}
          </p>
          <Link
            href={`/teams/${mine.id}`}
            className="text-claret text-sm font-medium hover:underline"
          >
            {mine.status === "pending_payment"
              ? "Finish paying →"
              : "Your pair →"}
          </Link>
        </div>
      )}

      {event.registrationLive && !mine && (
        <ReversePairsRegisterForm
          competitionId={event.competitionId}
          signedIn={!!user}
          me={
            me
              ? {
                  displayName: me.display_name as string | null,
                  email: me.email as string | null,
                }
              : null
          }
          feeLabel={
            fee.registrationFeeCents > 0
              ? `${formatCents(fee.registrationFeeCents)} per pair`
              : null
          }
          spotsLeft={
            event.settings.maxPairs === null
              ? null
              : Math.max(0, event.settings.maxPairs - held.length)
          }
        />
      )}

      {event.games.length === 0 ? (
        <div className="border-rule bg-surface space-y-3 rounded-lg border p-6">
          <p className="text-muted-foreground text-center text-sm">
            The schedule hasn&rsquo;t been drawn yet — it&rsquo;s made once the
            field is known, so everyone gets as many different teammates as the
            day allows.
          </p>
          {held.length > 0 && (
            <div>
              <p className="mb-2 text-center text-sm font-medium">
                {event.pairs.length} pair
                {event.pairs.length === 1 ? "" : "s"} in so far
                {awaitingPayment.length > 0 && (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    · {awaitingPayment.length} more waiting to pay
                  </span>
                )}
              </p>
              <ul className="flex flex-wrap justify-center gap-1.5">
                {event.pairs.map((p) => (
                  <li
                    key={p.id}
                    className="border-rule bg-paper-raised rounded-md border px-2 py-1 text-sm"
                  >
                    {p.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <>
          {played > 0 && (
            <ReversePairsStandingsCard
              pairs={event.pairs}
              standings={event.standings}
            />
          )}

          <PublicReversePairsSchedule games={event.games} byes={event.byes} />

          <PartnerMatrixCard pairs={event.pairs} matrix={event.matrix} />
        </>
      )}

      <p className="text-ink-3 text-center text-xs">
        Three pairs a side. Every pair on a side takes the game&rsquo;s margin,
        and the totals decide the order.
      </p>
    </div>
  );
}
