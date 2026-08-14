"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { LeagueCourt } from "@/lib/db/schema";
import type { VenueSummary } from "@/lib/venues/resolve";
import {
  assignCourtVenuesAction,
  suggestVenueAssignmentAction,
} from "@/server/actions/venues";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Which building each of a league's courts is in.
 *
 * Only worth showing once an org has venues on file — a single-site league has
 * nothing to assign, and the card would just be a row of "—" selects.
 *
 * Saving also stamps the venue onto games already scheduled on each court, so
 * the schedule and the court list can't drift apart.
 */
export function CourtVenuesCard({
  competitionId,
  courts,
  venues,
  divisions = [],
  startTimes = {},
}: {
  competitionId: string;
  courts: LeagueCourt[];
  venues: VenueSummary[];
  /** Divisions to pin to a building — the generator reads this. */
  divisions?: { id: string; name: string; venueId: string | null }[];
  /** Current per-venue start time, keyed by venue id. */
  startTimes?: Record<string, string>;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<LeagueCourt[]>(courts);
  const [divRows, setDivRows] = useState(divisions);
  const [times, setTimes] = useState<Record<string, string>>(startTimes);
  const [pending, start] = useTransition();

  if (venues.length === 0 || courts.length === 0) return null;

  const assigned = rows.filter((r) => r.venueId).length;
  const dirty =
    rows.length !== courts.length ||
    rows.some((r, i) => (r.venueId ?? null) !== (courts[i]?.venueId ?? null)) ||
    divRows.some(
      (d, i) => (d.venueId ?? null) !== (divisions[i]?.venueId ?? null),
    ) ||
    Object.keys(times).some((k) => times[k] !== startTimes[k]);

  // Only venues this league actually uses need a start time.
  const usedVenues = venues.filter((v) => rows.some((r) => r.venueId === v.id));

  function setVenue(index: number, venueId: string | null) {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, venueId } : r)),
    );
  }

  /**
   * Fill the division selects from the packer. Deliberately does NOT save — the
   * organizer reviews a proposal in the same controls they'd use by hand.
   */
  function suggest() {
    start(async () => {
      const res = await suggestVenueAssignmentAction(competitionId);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      const byDivision = new Map(
        res.placements.map((p) => [p.divisionId, p.venueId]),
      );
      setDivRows((prev) =>
        prev.map((d) => ({ ...d, venueId: byDivision.get(d.id) ?? d.venueId })),
      );
      if (res.unplaced.length > 0) {
        toast.warning(
          `${res.unplaced.length} division${res.unplaced.length === 1 ? "" : "s"} couldn't be placed: ${res.unplaced[0].reason}`,
        );
      } else {
        toast.success(
          `Proposed ${res.placements.length} placements. Review and save.`,
        );
      }
    });
  }

  function save() {
    start(async () => {
      const res = await assignCourtVenuesAction({
        competitionId,
        courts: rows.map((r) => ({
          label: r.label,
          prime: r.prime,
          venueId: r.venueId ?? null,
        })),
        divisions: divRows.map((d) => ({ id: d.id, venueId: d.venueId })),
        startTimes: usedVenues
          .filter((v) => times[v.id])
          .map((v) => ({ venueId: v.id, startTime: times[v.id] })),
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.updatedMatches > 0
          ? `Saved. ${res.updatedMatches} scheduled games now show their venue.`
          : "Saved.",
      );
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Court venues</CardTitle>
        <CardDescription>
          Which building each court is in. Set this when a night runs across
          more than one gym — the schedule then says “Terry Miller · Court A”
          instead of just “Court A”, which repeats at every venue.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Courts
        </p>
        <ul className="divide-border divide-y">
          {rows.map((c, i) => (
            <li
              key={`${c.label}-${i}`}
              className="flex flex-wrap items-center justify-between gap-3 py-2"
            >
              <span className="min-w-0 text-sm font-medium">
                Court {c.label}
                {c.prime && (
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    prime
                  </span>
                )}
              </span>
              <select
                aria-label={`Venue for court ${c.label}`}
                className="border-border bg-surface min-w-[12rem] rounded-md border px-2 py-1.5 text-sm"
                value={c.venueId ?? ""}
                disabled={pending}
                onChange={(e) => setVenue(i, e.target.value || null)}
              >
                <option value="">— no venue —</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>

        {divRows.length > 0 && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Divisions
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-muted-foreground flex-1 text-xs">
                A division plays its night in one building. The generator uses
                this to hand out courts per venue instead of from one pool.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={suggest}
                disabled={pending}
              >
                {pending ? "Working…" : "Auto-assign"}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Auto-assign packs divisions into your gyms and gives the early
              slots to whoever has been playing latest. It fills the boxes below
              — nothing is saved until you say so.
            </p>
            <ul className="divide-border divide-y">
              {divRows.map((d, i) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0 text-sm font-medium">{d.name}</span>
                  <select
                    aria-label={`Venue for ${d.name}`}
                    className="border-border bg-surface min-w-[12rem] rounded-md border px-2 py-1.5 text-sm"
                    value={d.venueId ?? ""}
                    disabled={pending}
                    onChange={(e) =>
                      setDivRows((prev) =>
                        prev.map((x, xi) =>
                          xi === i
                            ? { ...x, venueId: e.target.value || null }
                            : x,
                        ),
                      )
                    }
                  >
                    <option value="">— no venue —</option>
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        )}

        {usedVenues.length > 1 && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Start times
            </p>
            <p className="text-muted-foreground text-xs">
              Gyms on the same night rarely start together. Leave blank to use
              the league&apos;s own start time.
            </p>
            <ul className="divide-border divide-y">
              {usedVenues.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0 text-sm font-medium">{v.name}</span>
                  <input
                    type="time"
                    aria-label={`Start time at ${v.name}`}
                    className="border-border bg-surface rounded-md border px-2 py-1.5 text-sm tabular-nums"
                    value={times[v.id] ?? ""}
                    disabled={pending}
                    onChange={(e) =>
                      setTimes((prev) => ({ ...prev, [v.id]: e.target.value }))
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save venues"}
          </Button>
          <p className="text-muted-foreground text-xs">
            {assigned} of {rows.length} courts assigned.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
