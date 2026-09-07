"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { toast } from "sonner";

import type { TeamLocalityRow } from "@/lib/queries/registration-questions";
import { setHomeLocalityAction } from "@/server/actions/registration-questions";
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
 * How local each team is.
 *
 * Brampton Volleyball League runs for Brampton residents and wants to see, per
 * team, how many actually are. The count comes from the CITY behind each
 * address — as Google classified it — never from searching the text, because
 * "130 Brampton Road, Toronto" contains the word and means the opposite.
 *
 * "Not known" is shown as its own column rather than folded into the away
 * count. Somebody who typed their address instead of picking a suggestion, or
 * who hasn't answered yet, has not said they live elsewhere — and a total that
 * treats silence as an answer reads as "this team is mostly outsiders".
 */
export function LocalityCard({
  competitionId,
  homeCity,
  teams,
}: {
  competitionId: string;
  /** Null until the organizer names the town. */
  homeCity: string | null;
  teams: TeamLocalityRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [city, setCity] = useState(homeCity ?? "");

  function save() {
    start(async () => {
      const res = await setHomeLocalityAction({
        competitionId,
        homeLocality: city.trim() || null,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        city.trim() ? `Counting players from ${city.trim()}.` : "Turned off.",
      );
      router.refresh();
    });
  }

  const totals = teams.reduce(
    (acc, t) => ({
      home: acc.home + t.home,
      away: acc.away + t.away,
      unknown: acc.unknown + t.unknown,
    }),
    { home: 0, away: 0, unknown: 0 },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="size-4" />
          Where players live
        </CardTitle>
        <CardDescription>
          Counts each team against one town, from the address players give at
          registration. Leave it blank if your league doesn&apos;t draw that
          distinction.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="home-locality">Home town</Label>
            <Input
              id="home-locality"
              value={city}
              placeholder="Brampton"
              onChange={(e) => setCity(e.target.value)}
              className="max-w-56"
            />
          </div>
          <Button onClick={save} disabled={pending} variant="outline">
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>

        {!homeCity ? (
          <p className="text-muted-foreground text-sm">
            Name a town and each team&apos;s split appears here.
          </p>
        ) : teams.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing to count yet — this needs an{" "}
            <strong className="text-foreground font-medium">Address</strong>{" "}
            question asked of every player, and at least one registered team.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-muted-foreground border-rule border-b text-left text-xs tracking-wide uppercase">
                    <th className="p-2 font-semibold">Team</th>
                    <th className="p-2 text-right font-semibold">{homeCity}</th>
                    <th className="p-2 text-right font-semibold">Elsewhere</th>
                    <th className="p-2 text-right font-semibold">Not known</th>
                    <th className="p-2 text-right font-semibold">Roster</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t) => (
                    <tr key={t.teamId} className="border-rule/60 border-b">
                      <td className="text-foreground p-2 font-medium">
                        {t.teamName}
                      </td>
                      <td className="p-2 text-right">{t.home}</td>
                      <td className="p-2 text-right">{t.away}</td>
                      <td className="text-muted-foreground p-2 text-right">
                        {t.unknown}
                      </td>
                      <td className="text-muted-foreground p-2 text-right">
                        {t.total}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-foreground border-t-2 font-semibold">
                    <td className="p-2">All teams</td>
                    <td className="p-2 text-right">{totals.home}</td>
                    <td className="p-2 text-right">{totals.away}</td>
                    <td className="text-muted-foreground p-2 text-right">
                      {totals.unknown}
                    </td>
                    <td className="text-muted-foreground p-2 text-right">
                      {totals.home + totals.away + totals.unknown}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {totals.unknown > 0 && (
              <p className="text-muted-foreground text-xs">
                &ldquo;Not known&rdquo; is someone who hasn&apos;t given an
                address yet, or who typed one rather than picking a suggestion.
                They haven&apos;t said they live elsewhere, so they aren&apos;t
                counted as though they had.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
