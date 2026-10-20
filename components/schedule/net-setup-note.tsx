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

/** "Your team puts up the net on Court B. Arrive 10 min early." on a game the team sets up for. */
export function NetSetupNote({
  court,
  sport,
  className,
}: {
  court: string | null;
  sport?: Sport;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "bg-claret-tint text-claret-deep flex items-start gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
        className,
      )}
    >
      <Wrench className="mt-px size-3.5 shrink-0" />
      {netSetupText(court, sport)}
    </p>
  );
}
