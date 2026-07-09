import { DateTime } from "luxon";

import { cn } from "@/lib/utils";
import type { TeamActivity, TimelineRound } from "@/lib/schedule/team-timeline";

// Pure timeline logic lives in lib/ so it's unit-testable without a component.
// Re-exported here so existing "./team-timeline" importers keep working.
export {
  teamTimeline,
  teamScheduleEntries,
  teamOffRounds,
} from "@/lib/schedule/team-timeline";
export type {
  TeamActivity,
  TimelineRound,
  TeamEntry,
} from "@/lib/schedule/team-timeline";

const ACTIVITY_STYLE: Record<TeamActivity, string> = {
  play: "border-primary bg-primary text-primary-foreground",
  ref: "border-amber-400 bg-amber-100 text-amber-800",
  off: "border-border bg-muted text-muted-foreground",
};
const ACTIVITY_LABEL: Record<TeamActivity, string> = {
  play: "Play",
  ref: "Ref",
  off: "Off",
};

/** The Play/Ref/OFF strip — one pill per round, with the round's start time. */
export function ActivityStrip({
  timeline,
  timezone,
  className,
}: {
  timeline: TimelineRound[];
  timezone: string;
  className?: string;
}) {
  if (timeline.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {timeline.map((t) => (
        <div
          key={t.round}
          className={cn(
            "flex min-w-[3.25rem] flex-col items-center rounded-md border px-2 py-1 text-center",
            ACTIVITY_STYLE[t.activity],
          )}
        >
          <span className="text-[0.6rem] font-medium uppercase opacity-75">
            R{t.round}
          </span>
          <span className="text-xs leading-tight font-semibold">
            {ACTIVITY_LABEL[t.activity]}
          </span>
          {t.match?.scheduledAt && (
            <span className="text-[0.6rem] tabular-nums opacity-80">
              {DateTime.fromISO(t.match.scheduledAt, {
                zone: timezone,
              }).toFormat("h:mm a")}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * A dashed "rest" card marking a round a team sits out. Used in both the By-team
 * detail list and the My-team round view so an OFF round reads the same in each.
 */
export function OffCard({
  round,
  label = "You're off — Hydrate/Rest",
  teamName,
}: {
  /** Shown as an "R{n}" chip when the surrounding view doesn't already head the round. */
  round?: number | null;
  label?: string;
  /** Names the resting team when the view lists more than one followed team. */
  teamName?: string;
}) {
  return (
    <div className="border-border text-muted-foreground flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs">
      {round != null && (
        <span className="bg-muted rounded px-1.5 py-0.5 font-medium">
          R{round}
        </span>
      )}
      {teamName && <span className="font-medium">{teamName}</span>}
      {label}
    </div>
  );
}
