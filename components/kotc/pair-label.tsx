import { cn } from "@/lib/utils";

/**
 * A pair's team name with the participants' first names stacked beneath it — the
 * team name stays prominent, the players read as a smaller muted subtitle. Used
 * wherever a pair is listed so both stay legible on narrow mobile screens instead
 * of an inline "Name · players" string that truncates. Pure display: safe in both
 * server and client components.
 */
export function PairLabel({
  name,
  players,
  className,
  subClassName,
  align,
}: {
  name: string;
  players?: string | null;
  /** Extra classes for the team-name line (e.g. size / weight). */
  className?: string;
  /** Extra classes for the players sub-line (e.g. a lighter colour on a dark chip). */
  subClassName?: string;
  align?: "center";
}) {
  return (
    <span className={cn("block min-w-0", align === "center" && "text-center")}>
      <span className={cn("block truncate", className)}>{name}</span>
      {players && (
        <span
          className={cn(
            "text-muted-foreground block truncate text-xs font-normal",
            subClassName,
          )}
        >
          {players}
        </span>
      )}
    </span>
  );
}
