import { DateTime } from "luxon";

import type { AlignmentNight, AlignmentSession } from "@/lib/queries/alignment";
import { suggestTierSizes } from "@/lib/scheduler/alignment";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SeatTiersForm } from "./seat-tiers-form";

/**
 * The organizer's view of an alignment night (0165): each session filling in
 * as onsites enter scores, climbers moving up on their own, then the night's
 * 1–N ranking and the button that seats Round 1 from it.
 */
export function AlignmentCard({
  competitionId,
  night,
  timezone,
}: {
  competitionId: string;
  night: AlignmentNight;
  timezone: string;
}) {
  const time = (iso: string) =>
    DateTime.fromISO(iso, { zone: timezone }).toFormat("h:mm a");
  const day = DateTime.fromISO(night.sessions[0].startsAt, {
    zone: timezone,
  }).toFormat("cccc, LLL d");
  const done = night.sessions.filter((s) => s.complete).length;

  return (
    <Card id="alignment" className="scroll-mt-4">
      <CardHeader>
        <CardTitle>Alignment night · {day}</CardTitle>
        <CardDescription>
          Scores go in like any game. When a session&apos;s last score lands it
          is ranked — wins, then head to head, then +/− (15 points at most a
          game) — and its top two move up into the next session on their own.{" "}
          {done}/{night.sessions.length} sessions finished.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {night.sessions.map((s) => (
            <SessionTable key={s.id} session={s} time={time} />
          ))}
        </div>
        <Ranking competitionId={competitionId} night={night} />
      </CardContent>
    </Card>
  );
}

function SessionTable({
  session: s,
  time,
}: {
  session: AlignmentSession;
  time: (iso: string) => string;
}) {
  const waiting = s.seats.filter((x) => x.name == null);
  return (
    <div className="border-border rounded-lg border p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">
          {time(s.startsAt)} · {s.venueName ?? "Venue TBC"}
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {s.complete ? "Finished" : `${s.played}/${s.games} games`}
        </p>
      </div>
      <table className="w-full text-sm tabular-nums">
        <thead className="text-muted-foreground text-xs">
          <tr>
            <th className="w-6 text-left font-normal">#</th>
            <th className="text-left font-normal">Team</th>
            <th className="w-8 text-right font-normal">W</th>
            <th className="w-10 text-right font-normal">+/−</th>
            <th className="w-16 text-right font-normal">Result</th>
          </tr>
        </thead>
        <tbody>
          {s.standings.map((row, i) => {
            const rank = s.placeRanks[i];
            return (
              <tr key={row.teamId} className="border-border border-t">
                <td className="py-1">{i + 1}</td>
                <td className="truncate py-1">{row.name}</td>
                <td className="py-1 text-right">{row.wins}</td>
                <td className="py-1 text-right">
                  {row.plusMinus > 0 ? `+${row.plusMinus}` : row.plusMinus}
                </td>
                <td className="text-muted-foreground py-1 text-right text-xs">
                  {!s.complete ? "" : rank == null ? "Moves up" : `#${rank}`}
                </td>
              </tr>
            );
          })}
          {waiting.map((x, i) => (
            <tr key={x.letter} className="border-border border-t">
              <td className="py-1">–</td>
              <td className="text-muted-foreground py-1 italic" colSpan={4}>
                {i === 0 ? "1st" : "2nd"} from the{" "}
                {s.climbFromStartsAt ? time(s.climbFromStartsAt) : "earlier"}{" "}
                session
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Ranking({
  competitionId,
  night,
}: {
  competitionId: string;
  night: AlignmentNight;
}) {
  if (night.ranking.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        The overall ranking appears here once every session is finished.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-semibold">Overall ranking</h3>
        <ol className="space-y-1 gap-x-6 text-sm tabular-nums sm:columns-2 lg:columns-3">
          {night.ranking.map((r) => (
            <li key={r.teamId} className="flex break-inside-avoid gap-2">
              <span className="text-muted-foreground w-6 text-right">
                {r.rank}
              </span>
              <span>{r.name}</span>
            </li>
          ))}
        </ol>
      </div>
      {night.seated > 0 && (
        <p className="text-muted-foreground text-sm">
          {night.seated} teams are already in tiers. Seating again re-places
          them, until Round 1 is drawn.
        </p>
      )}
      <SeatTiersForm
        competitionId={competitionId}
        teamCount={night.ranking.length}
        defaultSizes={suggestTierSizes(night.ranking.length).join(", ")}
      />
    </div>
  );
}
