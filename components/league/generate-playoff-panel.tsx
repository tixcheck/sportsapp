"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import { toast } from "sonner";

import { generateLeaguePlayoffAction } from "@/server/actions/league-playoff";
import { leaguePlayoffProblem } from "@/lib/scheduler/league-playoff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Draw a two-night playoff where nobody's night ends after one game.
 *
 * The only real decision is how many teams make the bracket; everything else
 * follows from it, and the panel says what the night will look like before the
 * organizer commits — a playoff drawn wrong is a phone call to fourteen teams.
 */
export function GenerateLeaguePlayoffPanel({
  competitionId,
  competitionName,
  teamCount,
  hasPlayoff,
  initial,
}: {
  competitionId: string;
  competitionName: string;
  teamCount: number;
  hasPlayoff: boolean;
  initial: { date1: string; date2: string; startTime: string; minutes: number };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [topCount, setTopCount] = useState(8);
  const [date1, setDate1] = useState(initial.date1);
  const [date2, setDate2] = useState(initial.date2);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [confirmName, setConfirmName] = useState("");
  const [needsConfirm, setNeedsConfirm] = useState<number | null>(null);

  const problem = leaguePlayoffProblem(teamCount, topCount);
  const bottom = teamCount - topCount;
  // Night 1 is the whole first round plus the wave that follows it, alongside
  // the consolation — the number the organizer needs courts for.
  const widestWave = topCount / 2 + bottom / 2;

  function run() {
    start(async () => {
      const res = await generateLeaguePlayoffAction(
        {
          competitionId,
          topCount,
          dates: [date1, date2],
          startTime,
          minutesPerGame: minutes,
        },
        { confirmName: confirmName || undefined },
      );
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if ("needsConfirmation" in res) {
        setNeedsConfirm(res.played);
        toast.error(
          `${res.played} playoff game${res.played === 1 ? " has" : "s have"} a score. Type the name to redraw anyway.`,
        );
        return;
      }
      setNeedsConfirm(null);
      setConfirmName("");
      toast.success(
        `Playoff drawn — ${res.games} games over ${res.nights} nights.`,
      );
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="size-4" />
          Playoffs
        </CardTitle>
        <CardDescription>
          Top {topCount} play a bracket; the other {bottom} play a consolation.
          Everyone gets two games on the first night — the beaten
          quarter-finalists play each other rather than going home.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="po-top">Teams in the bracket</Label>
            <select
              id="po-top"
              className="border-input bg-surface h-9 rounded-md border px-3 text-sm"
              value={topCount}
              onChange={(e) => setTopCount(Number(e.target.value))}
            >
              {[8, 16].map((n) => (
                <option key={n} value={n} disabled={n > teamCount}>
                  Top {n}
                </option>
              ))}
            </select>
            <p className="text-ink-3 text-xs">
              {teamCount} teams finished the season.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="po-start">First game</Label>
            <Input
              id="po-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="po-d1">Playoff night 1</Label>
            <Input
              id="po-d1"
              type="date"
              value={date1}
              onChange={(e) => setDate1(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="po-d2">Playoff night 2</Label>
            <Input
              id="po-d2"
              type="date"
              value={date2}
              onChange={(e) => setDate2(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="po-min">Minutes per game</Label>
            <Input
              id="po-min"
              type="number"
              min={15}
              max={180}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value) || 45)}
            />
          </div>
        </div>

        {problem ? (
          <p className="text-claret text-sm">{problem}</p>
        ) : (
          <div className="border-rule bg-surface rounded-lg border p-3 text-sm">
            <p className="mb-1.5 font-medium">What this draws</p>
            <ul className="text-ink-2 space-y-1 text-xs">
              <li>
                <b>Night 1</b> — {widestWave} games at {startTime}, then{" "}
                {widestWave} more. Seeds 1v{topCount}, 2v{topCount - 1} and so
                on, then winners meet winners and losers meet losers.
              </li>
              <li>
                <b>Night 2</b> — the final and a bronze game. Nobody else plays.
              </li>
              <li>
                Needs <b>{widestWave} courts</b>. Every team plays twice on
                night 1.
              </li>
            </ul>
          </div>
        )}

        {needsConfirm !== null && (
          <div className="border-claret/40 bg-claret-tint/40 space-y-2 rounded-lg border p-3">
            <p className="text-sm">
              Redrawing deletes {needsConfirm} recorded playoff result
              {needsConfirm === 1 ? "" : "s"}. Type{" "}
              <b className="font-semibold">{competitionName}</b> to confirm.
            </p>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={competitionName}
              aria-label="Type the league name to confirm"
            />
          </div>
        )}

        <Button onClick={run} disabled={pending || !!problem}>
          {pending
            ? "Drawing…"
            : hasPlayoff
              ? "Redraw the playoff"
              : "Draw the playoff"}
        </Button>
      </CardContent>
    </Card>
  );
}
