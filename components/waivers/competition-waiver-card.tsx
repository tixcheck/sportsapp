"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import type { CompetitionWaiverState, Waiver } from "@/lib/queries/waivers";
import { setCompetitionWaiverAction } from "@/server/actions/waivers";
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
import { cn } from "@/lib/utils";

/**
 * Require a waiver for this competition, and see who still owes one.
 *
 * The outstanding list is the point. A count of signatures collected tells an
 * organizer nothing they can act on; a list of the people who haven't signed,
 * with their team, is a list they can work through on a Tuesday night.
 */
export function CompetitionWaiverCard({
  competitionId,
  orgId,
  state,
  available,
}: {
  competitionId: string;
  orgId: string;
  state: CompetitionWaiverState;
  /** Approved waivers this org can require. */
  available: Waiver[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [waiverId, setWaiverId] = useState(state.waiver?.id ?? "");
  const [minRoster, setMinRoster] = useState<number | "">(
    state.minRoster ?? "",
  );

  const outstanding = state.signatories.filter((s) => !s.signedAt);
  const signed = state.signatories.length - outstanding.length;

  function apply() {
    start(async () => {
      const res = await setCompetitionWaiverAction({
        competitionId,
        waiverId: waiverId || null,
        minRoster: minRoster === "" ? null : Number(minRoster),
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.teamsHeld > 0
          ? `Saved — ${res.teamsHeld} team${res.teamsHeld === 1 ? "" : "s"} now pending.`
          : "Saved.",
      );
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" />
          Waivers
        </CardTitle>
        <CardDescription>
          {state.waiver
            ? `Every rostered player must agree to “${state.waiver.title}” before their team is confirmed.`
            : "Off. Turn it on to hold teams as pending until their players have signed."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {available.length === 0 ? (
          <p className="text-ink-2 text-sm">
            Your organization hasn&rsquo;t approved a waiver yet.{" "}
            <Link
              href={`/orgs/${orgId}`}
              className="text-claret hover:underline"
            >
              Write one first
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="cw-waiver">Waiver required</Label>
                <select
                  id="cw-waiver"
                  className="border-input bg-surface h-9 rounded-md border px-3 text-sm"
                  value={waiverId}
                  onChange={(e) => setWaiverId(e.target.value)}
                >
                  <option value="">None — waivers off</option>
                  {available.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title} (v{w.version})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cw-min">Players needed per team</Label>
                <Input
                  id="cw-min"
                  type="number"
                  min={1}
                  max={30}
                  placeholder="No minimum"
                  value={minRoster}
                  onChange={(e) =>
                    setMinRoster(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                />
                <p className="text-ink-3 text-xs">
                  A team is pending until it has this many, all signed.
                </p>
              </div>
            </div>

            <Button onClick={apply} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </>
        )}

        {state.waiver && state.signatories.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">
                Signatures
                <span className="text-ink-3 ml-2 font-normal tabular-nums">
                  {signed} of {state.signatories.length}
                </span>
              </h3>
              {state.pending.length > 0 && (
                <span className="text-claret text-xs font-medium">
                  {state.pending.length} team
                  {state.pending.length === 1 ? "" : "s"} pending
                </span>
              )}
            </div>

            {state.pending.length > 0 && (
              <ul className="border-claret/30 bg-claret-tint/30 space-y-1 rounded-lg border p-3 text-sm">
                {state.pending.map((p) => (
                  <li key={p.teamId}>
                    <b className="font-semibold">{p.teamName}</b>{" "}
                    <span className="text-ink-2">
                      {p.reason === "roster"
                        ? `— only ${p.rosterSize} player${p.rosterSize === 1 ? "" : "s"} rostered`
                        : `— ${p.rosterSize - p.signed} of ${p.rosterSize} still to sign`}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <ul className="divide-rule border-rule divide-y rounded-lg border">
              {state.signatories.map((s) => (
                <li
                  key={`${s.teamId}:${s.userId}`}
                  className="flex items-center gap-3 p-2.5 text-sm"
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      s.signedAt ? "bg-pine" : "bg-claret",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {s.name}
                    <span className="text-ink-3 ml-2 text-xs">
                      {s.teamName}
                    </span>
                  </span>
                  <span className="text-ink-3 shrink-0 text-xs">
                    {s.signedAt
                      ? new Date(s.signedAt).toLocaleDateString("en-CA")
                      : "outstanding"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
