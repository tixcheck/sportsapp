import type { MatchFormat } from "@/lib/db/schema";
import { estimateMatchMinutes } from "@/lib/formats";
import { genericBracketPreview } from "@/lib/scheduler/bracket";

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

/**
 * Generic single-elimination preview shown on the public Brackets tab before
 * pools are played: the seed matchups (1v8, 4v5, …), the round progression, and
 * an estimated duration. No real teams — they fill in once pool play finishes.
 */
export function BracketPreview({
  playoffTeams,
  availableTeams,
  courts,
  matchFormat,
}: {
  playoffTeams: number;
  availableTeams: number;
  courts: number;
  matchFormat: MatchFormat;
}) {
  const slotMinutes = estimateMatchMinutes(matchFormat);
  const preview = genericBracketPreview({
    playoffTeams,
    available: availableTeams,
    courts,
    slotMinutes,
  });
  if (!preview) return null;

  const firstRound = preview.rounds[0];

  return (
    <div className="border-rule bg-paper-raised space-y-5 rounded-lg border p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h4 className="font-display text-lg font-semibold tracking-tight">
            Playoff bracket
          </h4>
          <p className="text-ink-2 text-sm">
            Top {preview.teamCount} · single elimination
            {preview.byes > 0 &&
              ` · ${preview.byes} bye${preview.byes === 1 ? "" : "s"}`}
          </p>
        </div>
        <span className="text-ink-2 text-sm italic">preview</span>
      </div>

      {firstRound.matchups && (
        <div>
          <p className="text-ink-2 mb-2 text-xs font-medium tracking-wide uppercase">
            {firstRound.name}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {firstRound.matchups.map((m) => (
              <div
                key={m.high}
                className="border-border bg-surface flex items-center justify-between rounded-md border px-3 py-2 text-sm tabular-nums"
              >
                {m.low === null ? (
                  <>
                    <span className="font-semibold">#{m.high}</span>
                    <span className="text-muted-foreground text-xs">bye</span>
                  </>
                ) : (
                  <>
                    <span className="font-semibold">#{m.high}</span>
                    <span className="text-muted-foreground text-xs">vs</span>
                    <span className="font-semibold">#{m.low}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {preview.rounds.map((r, i) => (
          <span key={r.round} className="flex items-center gap-2">
            {i > 0 && <span className="text-ink-2">→</span>}
            <span
              className={
                r.matchCount === 1 ? "font-semibold" : "text-muted-foreground"
              }
            >
              {r.name}
            </span>
          </span>
        ))}
      </div>

      <p className="text-ink-2 border-rule border-t pt-3 text-sm">
        Estimated{" "}
        <span className="text-ink font-medium tabular-nums">
          {formatDuration(preview.estimatedMinutes)}
        </span>{" "}
        of bracket play on {courts} court{courts === 1 ? "" : "s"}. Teams and
        exact times fill in once pool play finishes.
      </p>
    </div>
  );
}
