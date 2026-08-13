"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { LeagueCourt } from "@/lib/db/schema";
import type { VenueSummary } from "@/lib/venues/resolve";
import { assignCourtVenuesAction } from "@/server/actions/venues";
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
}: {
  competitionId: string;
  courts: LeagueCourt[];
  venues: VenueSummary[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<LeagueCourt[]>(courts);
  const [pending, start] = useTransition();

  if (venues.length === 0 || courts.length === 0) return null;

  const assigned = rows.filter((r) => r.venueId).length;
  const dirty =
    rows.length !== courts.length ||
    rows.some((r, i) => (r.venueId ?? null) !== (courts[i]?.venueId ?? null));

  function setVenue(index: number, venueId: string | null) {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, venueId } : r)),
    );
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
