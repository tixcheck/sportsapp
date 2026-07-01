import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crown, MapPin } from "lucide-react";

import {
  getKotcPoolEvents,
  getPublicKotcDetail,
  kotcDisplayStatus,
  type KotcPoolView,
  type KotcStageKind,
  type KotcStageView,
} from "@/lib/queries/kotc";
import { rankKotcPool } from "@/lib/kotc/ranking";
import { buildScoreSheet } from "@/lib/kotc/scoresheet";
import type { KotcConfig, KotcEvent } from "@/lib/kotc/engine";
import { AutoRefresh } from "@/components/public/auto-refresh";
import { StatusPill } from "@/components/kotc/status-pill";
import { ScoreSheet } from "@/components/kotc/score-sheet";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const k = await getPublicKotcDetail(slug);
  return { title: k ? `${k.name} — live scores` : "King of the Court" };
}

type Row = {
  teamId: string;
  name: string;
  players: string | null;
  points: number;
  out: number | null; // round dropped, else null
  medal: string | null;
};

const MEDALS = ["🥇", "🥈", "🥉"];

/** A pool's display rows: seeding = ranked by points (or just the roster before
 *  any scores); drop pools = survivors first (ranked by the last round), then
 *  eliminated pairs (most-recent first). */
function poolRows(
  pool: KotcPoolView,
  kind: KotcStageKind,
  playersOf: (id: string) => string | null,
): Row[] {
  const nameOf = (id: string) =>
    pool.pairs.find((p) => p.id === id)?.name ?? "—";

  if (kind === "seeding") {
    // Pool drawn but not scored yet — show who's in it so pairs can find theirs.
    if (pool.results.length === 0) {
      return pool.pairs.map((p) => ({
        teamId: p.id,
        name: p.name,
        players: playersOf(p.id),
        points: 0,
        out: null,
        medal: null,
      }));
    }
    return rankKotcPool(
      pool.results.map((r) => ({
        teamId: r.teamId,
        kingPoints: r.kingPoints,
        longestStreak: r.longestStreak,
        reachedSeq: r.reachedSeq,
      })),
    ).map((row) => ({
      teamId: row.teamId,
      name: nameOf(row.teamId),
      players: playersOf(row.teamId),
      points: row.kingPoints,
      out: null,
      medal: null,
    }));
  }

  const remaining = pool.pairs.filter((p) => p.eliminatedAtRound === null);
  const eliminated = pool.pairs.filter((p) => p.eliminatedAtRound !== null);
  const done = remaining.length <= 3 && pool.pairs.length > remaining.length;
  const lastRound = pool.rounds.at(-1);

  const survivorIds = new Set(remaining.map((p) => p.id));
  const survivors = lastRound
    ? rankKotcPool(
        lastRound.results.map((r) => ({
          teamId: r.teamId,
          kingPoints: r.kingPoints,
          longestStreak: r.longestStreak,
          reachedSeq: r.reachedSeq,
        })),
      )
        .filter((r) => survivorIds.has(r.teamId))
        .map((r) => ({ teamId: r.teamId, points: r.kingPoints }))
    : remaining.map((p) => ({ teamId: p.id, points: 0 }));

  const rows: Row[] = survivors.map((s, i) => ({
    teamId: s.teamId,
    name: nameOf(s.teamId),
    players: playersOf(s.teamId),
    points: s.points,
    out: null,
    medal: kind === "finals" && done ? (MEDALS[i] ?? null) : null,
  }));

  eliminated
    .sort((a, b) => (b.eliminatedAtRound ?? 0) - (a.eliminatedAtRound ?? 0))
    .forEach((p) =>
      rows.push({
        teamId: p.id,
        name: nameOf(p.id),
        players: playersOf(p.id),
        points: 0,
        out: (p.eliminatedAtRound ?? 0) + 1,
        medal: null,
      }),
    );

  return rows;
}

const STAGE_BADGE: Record<KotcStageKind, string> = {
  seeding: "Seeding",
  elimination: "Elimination",
  consolation: "Consolation",
  finals: "Finals",
};

export default async function PublicKotcPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const kotc = await getPublicKotcDetail(slug);
  if (!kotc) notFound();

  // Rally logs (for the read-only per-round score sheet on live-scored pools).
  const poolEvents = await getKotcPoolEvents(kotc.id);
  const names: Record<string, string> = Object.fromEntries(
    kotc.pairs.map((p) => [p.id, p.name]),
  );
  const config: KotcConfig = {
    roundsPerSession: kotc.settings.roundsPerSession,
    pointCap: kotc.settings.pointCap,
  };

  // Participant first names by pair, so viewers can spot their own pair.
  const players: Record<string, string> = Object.fromEntries(
    kotc.pairs.filter((p) => p.players).map((p) => [p.id, p.players as string]),
  );
  const playersOf = (id: string) => players[id] ?? null;

  // Podium = the finals pool once it's down to its last 3.
  const finals = kotc.stages.find((s) => s.kind === "finals");
  const finalsPool = finals?.pools[0];
  const podium =
    finalsPool &&
    finalsPool.pairs.filter((p) => p.eliminatedAtRound === null).length <= 3 &&
    finalsPool.pairs.length >
      finalsPool.pairs.filter((p) => p.eliminatedAtRound === null).length
      ? poolRows(finalsPool, "finals", playersOf).filter((r) => r.medal)
      : null;

  return (
    <div className="bg-background min-h-svh">
      <AutoRefresh />

      <header className="border-border bg-surface border-b">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <Link href="/" className="inline-flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- brand logo */}
            <img src="/logo.png" alt="MySportsApp" className="h-6 w-auto" />
          </Link>
          <p className="text-primary mt-5 inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            <Crown className="size-3.5" /> King of the Court · beach 2s
          </p>
          <h1 className="font-display text-foreground mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            {kotc.name}
          </h1>
          <p className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <StatusPill status={kotcDisplayStatus(kotc)} />
            {kotc.settings.location ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  kotc.settings.location,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-1 hover:underline"
              >
                <MapPin className="size-3.5" />
                {kotc.venue || kotc.settings.location}
              </a>
            ) : (
              kotc.venue && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {kotc.venue}
                </span>
              )
            )}
            <span className="tabular-nums">{kotc.pairs.length} pairs</span>
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        {/* Organizer notes */}
        {kotc.settings.notes && (
          <section className="border-border bg-surface rounded-xl border p-4">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Info
            </h2>
            <p className="mt-2 text-sm whitespace-pre-line">
              {kotc.settings.notes}
            </p>
          </section>
        )}

        {/* Podium */}
        {podium && podium.length > 0 && (
          <section className="border-primary/30 from-primary/10 rounded-2xl border bg-gradient-to-b to-transparent p-5 text-center">
            <p className="text-primary text-xs font-semibold tracking-wide uppercase">
              Champions
            </p>
            <ol className="mt-3 space-y-1.5">
              {podium.map((r) => (
                <li
                  key={r.teamId}
                  className="flex items-center justify-center gap-2"
                >
                  <span className="text-xl">{r.medal}</span>
                  <span className="font-display text-lg font-semibold">
                    {r.name}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Overall seed standings */}
        {kotc.seeds.length > 0 && (
          <section className="border-border rounded-xl border p-4">
            <h2 className="font-display text-base font-semibold">
              Overall standings
            </h2>
            <p className="text-muted-foreground mb-3 text-xs">
              Combined seed across the seeding rounds.
            </p>
            <ol className="space-y-0.5">
              {kotc.seeds.map((s) => (
                <li
                  key={s.teamId}
                  className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-2 py-1 text-sm"
                >
                  <span className="text-muted-foreground tabular-nums">
                    {s.seedRank}
                  </span>
                  <span className="truncate font-medium">{s.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {s.totalPoints} pts
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Stage-by-stage pools */}
        {kotc.stages
          .filter((stage) => stage.pools.length > 0)
          .map((stage) => (
            <StageSection
              key={stage.id}
              stage={stage}
              players={players}
              poolEvents={poolEvents}
              names={names}
              config={config}
            />
          ))}

        {kotc.stages.every((s) => s.pools.length === 0) &&
          kotc.seeds.length === 0 && (
            <p className="text-muted-foreground py-12 text-center text-sm">
              Scores will appear here once play begins.
            </p>
          )}

        <p className="text-muted-foreground/70 pt-4 text-center text-xs">
          Updates automatically · read-only view
        </p>
      </main>
    </div>
  );
}

function StageSection({
  stage,
  players,
  poolEvents,
  names,
  config,
}: {
  stage: KotcStageView;
  players: Record<string, string>;
  poolEvents: Record<string, KotcEvent[]>;
  names: Record<string, string>;
  config: KotcConfig;
}) {
  const playersOf = (id: string) => players[id] ?? null;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-base font-semibold">{stage.name}</h2>
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
          {STAGE_BADGE[stage.kind]}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {stage.pools.map((pool) => {
          const rows = poolRows(pool, stage.kind, playersOf);
          // Seeding pool drawn but not yet scored — a roster, not a ranking.
          const unscored =
            stage.kind === "seeding" && pool.results.length === 0;
          // Per-round score sheet, only where a live rally log exists.
          const events = poolEvents[pool.id] ?? [];
          const pairOrder = pool.pairs.map((p) => p.id);
          const sheet = events.some((e) => e.type === "rally")
            ? buildScoreSheet(pairOrder, events, config)
            : [];
          return (
            <div
              key={pool.id}
              className="border-border bg-surface space-y-2 rounded-xl border p-4"
            >
              <p className="font-display text-sm font-semibold">{pool.name}</p>
              {rows.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  Waiting for pairs…
                </p>
              ) : (
                <ol className="space-y-0.5">
                  {rows.map((r, i) => (
                    <li
                      key={r.teamId}
                      className={[
                        "grid grid-cols-[1.25rem_1fr_auto] items-center gap-2 rounded px-1 py-1 text-sm",
                        r.out !== null
                          ? "text-muted-foreground/60"
                          : r.medal
                            ? "bg-primary/5"
                            : "",
                      ].join(" ")}
                    >
                      <span className="text-muted-foreground tabular-nums">
                        {r.medal ?? (unscored ? "·" : i + 1)}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={[
                            "block truncate",
                            r.out !== null ? "line-through" : "font-medium",
                          ].join(" ")}
                        >
                          {r.name}
                        </span>
                        {r.players && (
                          <span className="text-muted-foreground block truncate text-xs">
                            {r.players}
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {r.out !== null
                          ? `out · R${r.out}`
                          : unscored
                            ? ""
                            : stage.kind === "seeding"
                              ? `${r.points} pts`
                              : "in"}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {sheet.length > 0 && (
                <ScoreSheet
                  rounds={sheet}
                  names={names}
                  pairOrder={pairOrder}
                  pointCap={config.pointCap}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
