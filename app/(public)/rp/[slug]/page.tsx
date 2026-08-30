import type { Metadata } from "next";
import { notFound } from "next/navigation";
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

  const played = event.games.filter((g) => g.scoreA !== null).length;
  const first = event.games.find((g) => g.scheduledAt)?.scheduledAt ?? null;
  const day = first
    ? DateTime.fromISO(first, { zone: event.timezone }).toFormat(
        "cccc d LLLL yyyy",
      )
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {/* Scores land while people are standing on the sideline looking at this. */}
      <AutoRefresh intervalMs={60_000} />

      <header className="space-y-1">
        <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
          {event.name}
        </h1>
        <p className="text-muted-foreground text-sm">
          Reverse Pairs · {event.pairs.length} pairs · {event.settings.courts}{" "}
          court{event.settings.courts === 1 ? "" : "s"}
          {day && <> · {day}</>}
        </p>
        {event.venue && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <MapPin className="size-3.5" />
            {event.venue}
          </p>
        )}
      </header>

      {event.registrationLive && (
        <ReversePairsRegisterForm
          competitionId={event.competitionId}
          signedIn={!!user}
          feeLabel={
            fee.registrationFeeCents > 0
              ? `${formatCents(fee.registrationFeeCents)} per pair`
              : null
          }
          spotsLeft={
            event.settings.maxPairs === null
              ? null
              : Math.max(0, event.settings.maxPairs - event.pairs.length)
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
          {event.pairs.length > 0 && (
            <div>
              <p className="mb-2 text-center text-sm font-medium">
                {event.pairs.length} pair
                {event.pairs.length === 1 ? "" : "s"} in so far
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
