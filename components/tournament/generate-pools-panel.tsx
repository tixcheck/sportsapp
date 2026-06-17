"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Shuffle, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { generatePoolsAction } from "@/server/actions/pools";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Team = { id: string; name: string; seed: number | null };
type DivisionTeams = { id: string; name: string; teams: Team[] };

/** Sort by seed (seeded first), falling back to the given registration order. */
function seedOrder(teams: Team[]): Team[] {
  return teams
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.seed ?? 1e9) - (b.t.seed ?? 1e9) || a.i - b.i)
    .map((x) => x.t);
}

export function GeneratePoolsPanel({
  competitionId,
  divisions,
  hasPools,
}: {
  competitionId: string;
  divisions: DivisionTeams[];
  hasPools: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [startTime, setStartTime] = useState("09:00");
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<Record<string, Team[]>>(() =>
    Object.fromEntries(divisions.map((d) => [d.id, seedOrder(d.teams)])),
  );

  // Re-sync when the team set changes on the server (a team was added/removed,
  // or pools were generated and seeds persisted). `divisions` only gets a new
  // reference on a server re-render, so local reordering never triggers this.
  // We keep the organizer's current order for teams still present and append
  // any new ones — so adding a team doesn't discard a manual seed order.
  useEffect(() => {
    setOrders((prev) => {
      const next: Record<string, Team[]> = {};
      for (const d of divisions) {
        const incoming = seedOrder(d.teams);
        const byId = new Map(incoming.map((t) => [t.id, t]));
        const kept = (prev[d.id] ?? [])
          .filter((t) => byId.has(t.id))
          .map((t) => byId.get(t.id)!);
        const keptIds = new Set(kept.map((t) => t.id));
        next[d.id] = [...kept, ...incoming.filter((t) => !keptIds.has(t.id))];
      }
      return next;
    });
  }, [divisions]);

  const totalTeams = divisions.reduce((n, d) => n + d.teams.length, 0);

  function move(divId: string, index: number, dir: -1 | 1) {
    setOrders((prev) => {
      const list = [...prev[divId]];
      const j = index + dir;
      if (j < 0 || j >= list.length) return prev;
      [list[index], list[j]] = [list[j], list[index]];
      return { ...prev, [divId]: list };
    });
  }

  function autoSeed(divId: string) {
    const d = divisions.find((x) => x.id === divId);
    if (d) setOrders((prev) => ({ ...prev, [divId]: [...d.teams] }));
  }

  function generate() {
    const orderByDivision = Object.fromEntries(
      Object.entries(orders).map(([divId, list]) => [
        divId,
        list.map((t) => t.id),
      ]),
    );
    startTransition(async () => {
      const result = await generatePoolsAction(
        competitionId,
        startTime,
        orderByDivision,
      );
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Generated ${result.poolCount} pools and ${result.matchCount} matches.`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  if (totalTeams < 2) {
    return (
      <p className="text-muted-foreground text-sm">
        Add at least 2 teams before drawing pools.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {divisions.map((d) => {
        const list = orders[d.id] ?? [];
        if (list.length === 0) return null;
        return (
          <div key={d.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">
                {divisions.length > 1 ? d.name : "Seed order"}
              </h4>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => autoSeed(d.id)}
              >
                <Shuffle />
                Auto-seed by registration
              </Button>
            </div>
            <ol className="divide-border border-border divide-y rounded-lg border">
              {list.map((t, i) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground w-5 text-right tabular-nums">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate font-medium">{t.name}</span>
                  <span className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={i === 0}
                      onClick={() => move(d.id, i, -1)}
                      aria-label="Move up"
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={i === list.length - 1}
                      onClick={() => move(d.id, i, 1)}
                      aria-label="Move down"
                    >
                      <ArrowDown />
                    </Button>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        );
      })}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="startTime">First match time</Label>
          <Input
            id="startTime"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-36"
          />
        </div>

        {hasPools ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Sparkles />
                Regenerate pools
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Regenerate pools?</DialogTitle>
                <DialogDescription>
                  This discards the current pool assignments and the entire pool
                  schedule, then draws fresh pools from the seed order above.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost" disabled={pending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={generate}
                  disabled={pending}
                >
                  {pending ? "Regenerating…" : "Discard & regenerate"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Button onClick={generate} disabled={pending}>
            <Sparkles />
            {pending ? "Generating…" : "Generate pools"}
          </Button>
        )}
      </div>
    </div>
  );
}
