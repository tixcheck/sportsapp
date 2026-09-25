import type { ReversePairsPair } from "@/lib/queries/reverse-pairs";
import { cn } from "@/lib/utils";

/**
 * The pairs on one side of a game.
 *
 * THE SEPARATOR BELONGS TO THE NAME THAT FOLLOWS IT, never to the one before.
 * Both schedules used to put it after: `{name}{" ·"}` in the organizer's view
 * and `join(" · ")` in the public one. Either way the dot is stranded at the
 * end of a wrapped line —
 *
 *     Theresa & Matt · Fabian & Leanne ·
 *     Flavio & Linnea
 *
 * — which reads as though a fourth pair failed to load. A leading separator
 * wraps together with its own name instead.
 *
 * On a phone there are no separators at all: three pairs a side never fit one
 * line at 375px, so each takes its own, which is also easier to scan when you
 * are looking for your own name at the side of a court.
 *
 * One component rather than two, because two renderings of the same thing is
 * how these drifted apart in the first place. No hooks, so the organizer's
 * client component and the public server component can both use it.
 */
export function PairList({
  pairs,
  won = false,
  align = "left",
}: {
  pairs: ReversePairsPair[];
  /** The winning side, once a score is in. */
  won?: boolean;
  align?: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-y-0.5 self-center text-sm",
        "sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-1.5",
        align === "right" && "sm:justify-end sm:text-right",
        won && "font-semibold",
      )}
    >
      {pairs.map((p, i) => (
        // A pair's name is one unit — never broken across lines mid-name.
        <span key={p.id} className="whitespace-nowrap">
          {i > 0 && (
            <span aria-hidden className="text-ink-3 hidden sm:inline">
              ·{" "}
            </span>
          )}
          {p.name}
        </span>
      ))}
    </div>
  );
}
