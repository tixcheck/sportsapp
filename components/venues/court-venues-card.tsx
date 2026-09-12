"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { LeagueCourt } from "@/lib/db/schema";
import type { VenueSummary } from "@/lib/venues/resolve";
import {
  countByVenue,
  courtsAt,
  setVenueCourtCount,
  togglePrime,
} from "@/lib/venues/court-counts";
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

  if (venues.length === 0) return null;

  const dirty =
    rows.length !== courts.length ||
    rows.some((r, i) => (r.venueId ?? null) !== (courts[i]?.venueId ?? null)) ||
    divRows.some(
      (d, i) => (d.venueId ?? null) !== (divisions[i]?.venueId ?? null),
    ) ||
    Object.keys(times).some((k) => times[k] !== startTimes[k]);

  // Only venues this league actually uses need a start time.
  const usedVenues = venues.filter((v) => rows.some((r) => r.venueId === v.id));
  const perVenue = countByVenue(rows);
  const strays = courtsAt(rows, null);

  function setCount(venueId: string | null, count: number) {
    setRows((prev) => setVenueCourtCount(prev, venueId, count));
  }

  function flipPrime(venueId: string | null, label: string) {
    setRows((prev) => togglePrime(prev, venueId, label));
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
          How many courts each gym has, and which tier plays there. The schedule
          then says “Bethune · Court 1” rather than just “Court 1”, which
          repeats at every building.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Gyms
        </p>
        <p className="text-muted-foreground text-xs">
          How many courts each gym has, and when it starts. Courts are numbered
          per gym, so every building has its own Court 1.
        </p>

        <ul className="divide-border divide-y">
          {venues.map((v) => {
            const mine = courtsAt(rows, v.id);
            return (
              <li key={v.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 text-sm font-medium">
                    {v.name}
                  </span>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Courts</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      inputMode="numeric"
                      aria-label={`Courts at ${v.name}`}
                      className="border-border bg-surface w-16 rounded-md border px-2 py-1.5 text-sm tabular-nums"
                      value={perVenue[v.id] ?? 0}
                      disabled={pending}
                      onChange={(e) => setCount(v.id, Number(e.target.value))}
                    />
                  </label>
                  {mine.length > 0 && (
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Start</span>
                      <input
                        type="time"
                        aria-label={`Start time at ${v.name}`}
                        className="border-border bg-surface rounded-md border px-2 py-1.5 text-sm tabular-nums"
                        value={times[v.id] ?? ""}
                        disabled={pending}
                        onChange={(e) =>
                          setTimes((prev) => ({
                            ...prev,
                            [v.id]: e.target.value,
                          }))
                        }
                      />
                    </label>
                  )}
                </div>

                {/* Prime courts still matter per court — the generator balances
                    who gets them — so they stay togglable, just inline. */}
                {mine.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-muted-foreground text-xs">
                      Prime:
                    </span>
                    {mine.map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        disabled={pending}
                        aria-pressed={c.prime}
                        onClick={() => flipPrime(v.id, c.label)}
                        className={
                          c.prime
                            ? "bg-primary text-primary-foreground rounded-full px-2.5 py-0.5 text-xs font-semibold"
                            : "border-border text-muted-foreground rounded-full border px-2.5 py-0.5 text-xs"
                        }
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* Courts from before this league had venues. Shown only if any exist,
            so the normal case is not cluttered by an empty bucket. */}
        {strays.length > 0 && (
          <div className="border-border rounded-lg border border-dashed p-3">
            <p className="text-sm font-medium">Not in any gym</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {strays.length} court{strays.length === 1 ? "" : "s"} predate your
              venues ({strays.map((c) => c.label).join(", ")}). Set a gym&apos;s
              count above to replace them, then drop this to 0.
            </p>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Keep</span>
              <input
                type="number"
                min={0}
                max={20}
                aria-label="Courts not in any gym"
                className="border-border bg-surface w-16 rounded-md border px-2 py-1.5 text-sm tabular-nums"
                value={strays.length}
                disabled={pending}
                onChange={(e) => setCount(null, Number(e.target.value))}
              />
            </label>
          </div>
        )}

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

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save venues"}
          </Button>
          <p className="text-muted-foreground text-xs">
            {rows.length} court{rows.length === 1 ? "" : "s"} across{" "}
            {usedVenues.length} gym{usedVenues.length === 1 ? "" : "s"}.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
