import { Wrench } from "lucide-react";

import type { Sport } from "@/lib/formats";
import { formatCourtLabel } from "@/lib/scheduler/court-label";
import { cn } from "@/lib/utils";
import { NET_SETUP_MINUTES } from "@/lib/scheduler/net-duty";

/** The sentence every surface uses, so the Help guide can quote it. */
export function netSetupText(court: string | null, sport?: Sport): string {
  const where = formatCourtLabel(court, sport);
  return `Your team puts up the net${where ? ` on ${where}` : ""}. Arrive ${NET_SETUP_MINUTES} min early.`;
}

/** The take-down sentence, for the last game on a court. */
export function netTakedownText(court: string | null, sport?: Sport): string {
  const where = formatCourtLabel(court, sport);
  return `Your team takes the net down${where ? ` on ${where}` : ""} after this game.`;
}

/** "Your team puts up the net on Court B. Arrive 10 min early." and/or the take-down line, on a game the team has net duty for. */
export function NetSetupNote({
  court,
  sport,
  className,
  setup = true,
  takedown = false,
}: {
  court: string | null;
  sport?: Sport;
  className?: string;
  setup?: boolean;
  takedown?: boolean;
}) {
  if (!setup && !takedown) return null;
  return (
    <p
      className={cn(
        "bg-claret-tint text-claret-deep flex items-start gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
        className,
      )}
    >
      <Wrench className="mt-px size-3.5 shrink-0" />
      <span>
        {[
          setup ? netSetupText(court, sport) : null,
          takedown ? netTakedownText(court, sport) : null,
        ]
          .filter(Boolean)
          .join(" ")}
      </span>
    </p>
  );
}
