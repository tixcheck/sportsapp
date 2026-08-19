import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPlayerProfile } from "@/lib/queries/player-stats";
import {
  formatPct,
  formatRatioPct,
  formatSigned,
  type PlayerStats,
} from "@/lib/stats/player-stats";
import { competitionPath } from "@/lib/queries/dashboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ playerId: string }>;
}): Promise<Metadata> {
  const { playerId } = await params;
  const profile = await getPlayerProfile(playerId);
  return { title: profile ? `${profile.name} — stats` : "Player" };
}

/** One headline number. The label carries the definition so nothing needs a key. */
function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="border-border bg-surface rounded-lg border p-3">
      <p className="text-ink-2 text-[0.66rem] font-bold tracking-[0.1em] uppercase">
        {label}
      </p>
      <p
        className={cn(
          "font-display mt-1 text-2xl tabular-nums",
          tone === "good" && "text-emerald-700",
          tone === "bad" && "text-rose-700",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-ink-3 mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}

function StatGrid({ s }: { s: PlayerStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <Stat
        label="Sets played"
        value={String(s.gamesPlayed)}
        hint={`${s.wins}W · ${s.losses}L${s.draws ? ` · ${s.draws}D` : ""}`}
      />
      <Stat label="Win rate" value={formatPct(s.winPct)} hint="sets won" />
      <Stat
        label="Points for/against"
        value={formatRatioPct(s.forAgainstRatio)}
        hint={`${s.pointsFor} scored · ${s.pointsAgainst} conceded`}
      />
      <Stat
        label="Points a set"
        value={s.avgPointsFor.toFixed(1)}
        hint={`${s.pointsPerGame.toFixed(1)} played per set`}
      />
      <Stat
        label="Net clutch"
        value={formatSigned(s.netClutch)}
        hint={`${s.clutchWins} won · ${s.clutchLosses} lost by ≤2`}
        tone={s.netClutch > 0 ? "good" : s.netClutch < 0 ? "bad" : undefined}
      />
      <Stat
        label="Close sets"
        value={formatRatioPct(s.clutchRate)}
        hint="decided by 2 or fewer"
      />
      <Stat
        label="Points played"
        value={String(s.pointsPlayed)}
        hint="both directions"
      />
      <Stat
        label="Sets won"
        value={String(s.wins)}
        hint={`of ${s.gamesPlayed}`}
      />
    </div>
  );
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const profile = await getPlayerProfile(playerId);
  if (!profile) notFound();

  const played = profile.career.gamesPlayed > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {profile.name}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {played
            ? `${profile.career.gamesPlayed} sets across ${profile.competitions.length} competition${
                profile.competitions.length === 1 ? "" : "s"
              }`
            : "No recorded sets yet."}
        </p>
      </header>

      {played ? (
        <>
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold">Career</h2>
            <StatGrid s={profile.career} />
          </section>

          {profile.competitions.map((c) => (
            <Card key={`${c.competitionId}:${c.teamId}`}>
              <CardHeader>
                <CardTitle>
                  <Link
                    href={competitionPath(c.type, c.slug)}
                    className="hover:text-primary underline-offset-2 hover:underline"
                  >
                    {c.competitionName}
                  </Link>
                </CardTitle>
                <CardDescription>
                  Playing for{" "}
                  <Link
                    href={`/teams/${c.teamId}`}
                    className="text-foreground font-medium underline-offset-2 hover:underline"
                  >
                    {c.teamName}
                  </Link>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StatGrid s={c.stats} />
              </CardContent>
            </Card>
          ))}

          <p className="text-ink-3 text-xs">
            Stats cover every set this player&apos;s team played. In a
            fixed-pairs league that is exactly their own record; where rosters
            rotate it counts team sets rather than personal appearances.
          </p>
        </>
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-sm">
              Stats appear here once this player&apos;s team has scores
              recorded.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
