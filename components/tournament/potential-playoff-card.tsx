import { Trophy, TriangleAlert } from "lucide-react";

import type { PlayoffProjection } from "@/lib/queries/my-matches";

const TRACK_LABEL: Record<string, string> = {
  championship: "Championship",
  consolation: "Consolation",
};

/**
 * "If pools ended now" playoff projection for one of the viewer's teams — shown
 * in My matches before the bracket is generated. Always flagged provisional.
 */
export function PotentialPlayoffCard({
  projection: p,
}: {
  projection: PlayoffProjection;
}) {
  const trackLabel = p.track ? TRACK_LABEL[p.track] : "Playoff";

  return (
    <div className="border-border bg-surface rounded-lg border border-dashed p-4 shadow-sm">
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span className="truncate">{p.competitionName}</span>
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
          Potential playoff
        </span>
      </div>

      {p.madeBracket ? (
        <div className="mt-2">
          <p className="font-display text-base font-medium">
            Seed {p.seed} · {trackLabel}
          </p>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {p.opponentName ? (
              <>
                First match vs{" "}
                <span className="text-foreground font-medium">
                  {p.opponentName}
                </span>
              </>
            ) : (
              <>
                First-round{" "}
                <span className="text-foreground font-medium">bye</span> — you
                advance to round 2
              </>
            )}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground mt-2 text-sm">
          Outside the playoff cutoff right now — win more to climb in.
        </p>
      )}

      <p className="text-claret mt-2 flex items-center gap-1.5 text-xs">
        <Trophy className="size-3.5 shrink-0" />
        Provisional — updates as scores come in.
      </p>
      {(!p.poolsComplete || p.tiedAtCutoff) && (
        <p className="text-ink-2 mt-1 flex items-center gap-1.5 text-xs">
          <TriangleAlert className="size-3.5 shrink-0" />
          {!p.poolsComplete
            ? "Pool play isn't finished yet."
            : "Seeding near the cutoff is tied — this could change."}
        </p>
      )}
    </div>
  );
}
