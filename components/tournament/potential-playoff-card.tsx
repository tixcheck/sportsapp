import { Trophy, TriangleAlert } from "lucide-react";

import type { PlayoffProjection } from "@/lib/queries/my-matches";

// Plain-language bracket placement; opponents are deliberately not shown until
// the bracket is actually drawn (projected matchups shift as scores come in).
const BRACKET_LABEL: Record<string, string> = {
  championship: "top bracket",
  consolation: "bottom bracket",
};

/**
 * "If pools ended now" playoff projection for one of the viewer's teams — shown
 * in My matches before the bracket is generated. Always flagged provisional;
 * shows the projected bracket + seed, never the projected opponent.
 */
export function PotentialPlayoffCard({
  projection: p,
}: {
  projection: PlayoffProjection;
}) {
  const bracketLabel = p.track ? BRACKET_LABEL[p.track] : "playoff bracket";

  return (
    <div className="border-border bg-surface rounded-lg border border-dashed p-4 shadow-sm">
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span className="truncate">{p.competitionName}</span>
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
          Potential playoff
        </span>
      </div>

      {p.madeBracket ? (
        <p className="mt-2 text-sm">
          Based on your current games, you&apos;re on track for the{" "}
          <span className="font-display text-base font-medium">
            {bracketLabel}
          </span>{" "}
          as <span className="font-medium">seed {p.seed}</span>.
        </p>
      ) : (
        <p className="text-muted-foreground mt-2 text-sm">
          Outside the playoff cutoff right now — win more to climb in.
        </p>
      )}

      <p className="text-claret mt-2 flex items-center gap-1.5 text-xs">
        <Trophy className="size-3.5 shrink-0" />
        Provisional — updates as scores come in. Matchups are set when the
        bracket is drawn.
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
