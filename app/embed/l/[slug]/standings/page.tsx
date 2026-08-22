import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublicLeague } from "@/lib/queries/leagues";
import { getStandings } from "@/lib/standings/compute";
import { getLadderNightStandings } from "@/lib/queries/ladder-standings";
import {
  StandingsGroups,
  StandingsLegend,
  StandingsTable,
} from "@/components/standings/standings-table";
import { LadderNightStandings } from "@/components/league/ladder-night-standings";
import { EmbedAutoHeight } from "@/components/public/embed-frame";
import { EmbedTheme } from "@/components/public/embed-theme";
import { EmbedFooter } from "@/components/public/embed-footer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const league = await getPublicLeague(slug);
  return { title: league ? `${league.name} — standings` : "Standings" };
}

export default async function EmbedStandingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = (await searchParams) ?? {};
  const league = await getPublicLeague(slug);
  if (!league) notFound();

  const [standings, ladderNights] = await Promise.all([
    getStandings(league.id),
    getLadderNightStandings(league.id),
  ]);
  const differential = league.tiebreaker === "differential";

  return (
    <EmbedTheme accent={query.accent} background={query.bg}>
      <EmbedAutoHeight>
        {ladderNights.length > 0 ? (
          <LadderNightStandings
            nights={ladderNights}
            timezone={league.timezone}
            format={league.matchFormat}
            sport={league.sport}
            differential={differential}
          />
        ) : standings.length > 1 ? (
          <StandingsGroups
            groups={standings}
            showDivision={false}
            format={league.matchFormat}
            sport={league.sport}
            differential={differential}
          />
        ) : (
          <div className="space-y-3">
            <StandingsTable
              rows={standings[0]?.rows ?? []}
              format={league.matchFormat}
              sport={league.sport}
              differential={differential}
            />
            {(standings[0]?.rows.length ?? 0) > 0 && (
              <StandingsLegend
                format={league.matchFormat}
                sport={league.sport}
                differential={differential}
              />
            )}
          </div>
        )}
        <EmbedFooter slug={slug} label="Full schedule & standings" />
      </EmbedAutoHeight>
    </EmbedTheme>
  );
}
