import type { MyMatch, PlayoffProjection } from "@/lib/queries/my-matches";
import { MyMatchCard } from "@/components/scoring/my-match-card";
import { PotentialPlayoffCard } from "@/components/tournament/potential-playoff-card";

function timeMs(m: MyMatch): number {
  return m.scheduledAt
    ? new Date(m.scheduledAt).getTime()
    : Number.MAX_SAFE_INTEGER;
}

/** Earliest start first (unscheduled last), then round. */
const byTime = (a: MyMatch, b: MyMatch) =>
  timeMs(a) - timeMs(b) || (a.round ?? 0) - (b.round ?? 0);

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {title}
      </p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/**
 * The shared "what's on" view used by both /my-matches and the My-team page, so
 * they can't drift. Sections, time-sorting, phase tagging, the projection card —
 * one implementation. Games you ref are split out from games you play; play
 * sections are competition-type aware (tournaments → Round robin / Playoff
 * bracket; leagues → Schedule). Renders nothing when there's nothing to show —
 * the caller owns the empty state.
 */
export function MatchSections({
  matches,
  projections = [],
}: {
  matches: MyMatch[];
  projections?: PlayoffProjection[];
}) {
  // My Matches is an action list: show only games still to play or confirm.
  // Final games — and thus any fully-completed competition, like a wrapped-up
  // tournament — drop off here; results live in each competition's standings.
  const actionable = matches.filter((m) => m.state !== "final");

  // Up Next: the earliest upcoming game the viewer plays (not one they ref).
  const upNext = actionable.filter((m) => m.role === "play").sort(byTime)[0];
  const rest = actionable.filter((m) => m.id !== upNext?.id);
  const playing = rest.filter((m) => m.role === "play");
  const reffing = rest.filter((m) => m.role === "ref").sort(byTime);
  const roundRobin = playing
    .filter((m) => m.competitionType === "tournament" && m.phase === "pool")
    .sort(byTime);
  const leagueGames = playing
    .filter((m) => m.competitionType === "league")
    .sort(byTime);
  const bracket = playing.filter((m) => m.phase === "bracket").sort(byTime);
  const hasPlayoff = bracket.length > 0 || projections.length > 0;

  const nothingToShow =
    !upNext &&
    roundRobin.length === 0 &&
    leagueGames.length === 0 &&
    !hasPlayoff &&
    reffing.length === 0;

  if (nothingToShow) {
    if (matches.length === 0 && projections.length === 0) return null;
    return (
      <div className="border-border bg-surface text-muted-foreground rounded-lg border p-10 text-center text-sm">
        You&apos;re all caught up — no upcoming matches. Past results live in
        each competition&apos;s standings.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {upNext && (
        <Section title="Up next">
          <MyMatchCard match={upNext} />
        </Section>
      )}

      {roundRobin.length > 0 && (
        <Section title="Round robin">
          {roundRobin.map((m) => (
            <MyMatchCard key={m.id} match={m} />
          ))}
        </Section>
      )}

      {leagueGames.length > 0 && (
        <Section title="Schedule">
          {leagueGames.map((m) => (
            <MyMatchCard key={m.id} match={m} />
          ))}
        </Section>
      )}

      {hasPlayoff && (
        <Section title="Playoff bracket">
          {bracket.map((m) => (
            <MyMatchCard key={m.id} match={m} />
          ))}
          {projections.map((p) => (
            <PotentialPlayoffCard key={p.teamId} projection={p} />
          ))}
        </Section>
      )}

      {reffing.length > 0 && (
        <Section title="Reffing">
          {reffing.map((m) => (
            <MyMatchCard key={m.id} match={m} />
          ))}
        </Section>
      )}
    </div>
  );
}
