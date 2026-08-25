import { DateTime } from "luxon";
import { History, PencilLine, Trash2, TriangleAlert } from "lucide-react";

import type { AuditEntry } from "@/lib/queries/match-audit";
import type { MatchAuditAction } from "@/lib/db/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The history of what changed in a competition, and who changed it.
 *
 * Schedule events are called out rather than blended in: those are the rows
 * that describe deleted fixtures, and after an accident they are the only
 * record left of what was there. They deliberately show even though the match
 * they refer to no longer exists.
 */
const TONE: Record<
  MatchAuditAction,
  { icon: typeof History; className: string }
> = {
  score_submitted: { icon: PencilLine, className: "text-ink-3" },
  score_confirmed: { icon: PencilLine, className: "text-pine" },
  score_disputed: { icon: TriangleAlert, className: "text-claret" },
  score_cleared: { icon: Trash2, className: "text-claret" },
  schedule_redrawn: { icon: History, className: "text-ink-2" },
  schedule_erased: { icon: TriangleAlert, className: "text-claret" },
};

export function AuditLogCard({
  entries,
  timezone,
}: {
  entries: AuditEntry[];
  timezone: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" />
          History
        </CardTitle>
        <CardDescription>
          Every score and schedule change, newest first. This log cannot be
          edited or deleted from inside the app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-ink-3 text-sm">
            Nothing recorded yet. Entries appear as scores go in and the
            schedule changes.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {entries.map((e) => {
              const tone = TONE[e.action] ?? TONE.score_submitted;
              const Icon = tone.icon;
              const when = DateTime.fromISO(e.createdAt, {
                zone: timezone,
              }).toFormat("d LLL, HH:mm");
              const teams =
                e.detail?.homeTeam && e.detail?.awayTeam
                  ? `${e.detail.homeTeam} v ${e.detail.awayTeam}`
                  : null;
              return (
                <li
                  key={e.id}
                  className="border-rule grid list-none grid-cols-[1rem_1fr] gap-3 border-b pb-3 last:border-0 last:pb-0"
                >
                  <Icon className={`mt-0.5 size-4 ${tone.className}`} />
                  <div className="min-w-0">
                    <p className="text-sm">{e.summary}</p>
                    <p className="text-ink-3 mt-0.5 text-xs">
                      {when}
                      {teams ? ` · ${teams}` : ""}
                      {e.actorName ? ` · ${e.actorName}` : ""}
                      {e.orphaned && e.action.startsWith("score")
                        ? " · match since deleted"
                        : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
