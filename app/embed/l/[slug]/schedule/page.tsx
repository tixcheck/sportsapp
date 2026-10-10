import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";

import { getPublicLeague } from "@/lib/queries/leagues";
import { defaultScheduleDay } from "@/lib/schedule/default-day";
import { ScheduleView } from "@/components/schedule/schedule-view";
import { EmbedAutoHeight } from "@/components/public/embed-frame";
import { EmbedTheme } from "@/components/public/embed-theme";
import { EmbedFooter } from "@/components/public/embed-footer";
import { getScheduleGate } from "@/lib/queries/schedule-gate";
import { ScheduleGateCard } from "@/components/schedule/schedule-gate-card";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const league = await getPublicLeague(slug);
  return { title: league ? `${league.name} — schedule` : "Schedule" };
}

export default async function EmbedSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = (await searchParams) ?? {};
  // RLS decides this, exactly as it does for the public page: a private or
  // draft league is invisible here too, so an embed can never be used to see
  // something the league page wouldn't show.
  const league = await getPublicLeague(slug);
  if (!league) notFound();
  // Shared with ready teams only (0161): an embed is a public page.
  const gate = await getScheduleGate(league.id);

  const today = DateTime.now().setZone(league.timezone).toFormat("yyyy-MM-dd");
  const playingDays = league.schedule
    .map((m) =>
      m.scheduledAt
        ? DateTime.fromISO(m.scheduledAt, { zone: league.timezone }).toFormat(
            "yyyy-MM-dd",
          )
        : null,
    )
    .filter((d): d is string => d != null);

  return (
    <EmbedTheme accent={query.accent} background={query.bg}>
      <EmbedAutoHeight>
        {!gate.canView ? (
          <ScheduleGateCard gate={gate} />
        ) : (
          <ScheduleView
            matches={league.schedule}
            timezone={league.timezone}
            sport={league.sport}
            initialDay={defaultScheduleDay(playingDays, today)}
            views={league.scheduleViews}
          />
        )}
        <EmbedFooter slug={slug} label="Full schedule & standings" />
      </EmbedAutoHeight>
    </EmbedTheme>
  );
}
