import {
  getMyMatches,
  getMyPlayoffProjections,
  type MyMatch,
} from "@/lib/queries/my-matches";
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

export default async function MyMatchesPage() {
  const [matches, projections] = await Promise.all([
    getMyMatches(),
    getMyPlayoffProjections(),
  ]);

  // Up Next: the earliest non-final game the viewer plays (not one they ref).
  const upNext = [
    ...matches.filter((m) => m.state !== "final" && m.role === "play"),
  ].sort(byTime)[0];
  const rest = matches.filter((m) => m.id !== upNext?.id);
  // Games you ref are split out from games you play. Each section is time-sorted
  // within itself (no more pool/playoff interleaving). Play-section labels are
  // competition-type aware: tournaments use "Round robin" / "Playoff bracket"; a
  // league's games get a neutral "Schedule".
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
        My matches
      </h1>

      {matches.length === 0 && projections.length === 0 ? (
        <div className="border-border bg-surface text-muted-foreground rounded-lg border p-10 text-center text-sm">
          No matches yet. When you captain a team — or your team is assigned to
          ref — your matches show up here.
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
