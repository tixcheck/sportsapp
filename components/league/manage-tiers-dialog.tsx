"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { manageLeagueTiersAction } from "@/server/actions/leagues";
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

type Row = {
  id?: string;
  name: string;
  /** Registration cap for this tier. Null = uncapped. */
  maxTeams: number | null;
  /** The gym this tier plays in. Null = the competition's own venue. */
  venueId: string | null;
};

/**
 * Manage a league's tiers (skill divisions). Each tier is its own mini-league —
 * teams play only within their tier, with a separate schedule and standings.
 * Removing a tier un-sorts its teams (they aren't deleted); regenerate the
 * schedule after changing tiers.
 */
export function ManageTiersDialog({
  competitionId,
  tiers,
  venues = [],
}: {
  competitionId: string;
  tiers: {
    id: string;
    name: string;
    maxTeams?: number | null;
    venueId?: string | null;
  }[];
  /** The org's buildings, so a tier can be pinned to one. */
  venues?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const toRow = (t: {
    id: string;
    name: string;
    maxTeams?: number | null;
    venueId?: string | null;
  }): Row => ({
    id: t.id,
    name: t.name,
    maxTeams: t.maxTeams ?? null,
    venueId: t.venueId ?? null,
  });
  const [rows, setRows] = useState<Row[]>(tiers.map(toRow));
  const [pending, start] = useTransition();

  function reset() {
    setRows(tiers.map(toRow));
  }

  function save() {
    const cleaned = rows
      .map((r) => ({ ...r, name: r.name.trim() }))
      .filter((r) => r.name.length > 0);
    start(async () => {
      const res = await manageLeagueTiersAction({
        competitionId,
        tiers: cleaned.map((r) => ({
          id: r.id,
          name: r.name,
          maxTeams: r.maxTeams,
          venueId: r.venueId,
        })),
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Tiers saved. Regenerate the schedule to apply.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Layers className="size-4" />
          Tiers
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage tiers</DialogTitle>
          <DialogDescription>
            Each tier is a separate mini-league — teams play only their own
            tier, with its own schedule and standings. Leave empty for a
            single-tier league.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {rows.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No tiers yet — this league is single-tier. Add tiers like
              &ldquo;Recreational&rdquo; and &ldquo;Competitive&rdquo;.
            </p>
          )}
          {rows.map((r, i) => {
            const set = (patch: Partial<Row>) =>
              setRows((prev) =>
                prev.map((x, k) => (k === i ? { ...x, ...patch } : x)),
              );
            return (
              <div
                key={r.id ?? `new-${i}`}
                className="border-border grid gap-2 rounded-lg border p-2"
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={r.name}
                    placeholder={`Tier ${i + 1}`}
                    onChange={(e) => set({ name: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label="Remove tier"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      setRows((prev) => prev.filter((_, k) => k !== i))
                    }
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-muted-foreground text-xs">
                      Max teams in this tier
                    </span>
                    <Input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      placeholder="No limit"
                      value={r.maxTeams ?? ""}
                      onChange={(e) =>
                        set({
                          maxTeams: e.target.value
                            ? Math.max(1, Number(e.target.value))
                            : null,
                        })
                      }
                    />
                  </label>

                  {venues.length > 0 && (
                    <label className="grid gap-1">
                      <span className="text-muted-foreground text-xs">
                        Plays at
                      </span>
                      <select
                        value={r.venueId ?? ""}
                        onChange={(e) =>
                          set({ venueId: e.target.value || null })
                        }
                        className="border-input bg-surface h-9 rounded-md border px-3 text-sm"
                      >
                        <option value="">Wherever the league plays</option>
                        {venues.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                { name: "", maxTeams: null, venueId: null },
              ])
            }
          >
            <Plus className="size-4" /> Add tier
          </Button>
        </div>

        <p className="text-muted-foreground text-xs">
          Removing a tier un-sorts its teams (they aren&apos;t deleted).
          Changing tiers takes effect the next time you generate the schedule. A
          tier pinned to a gym is scheduled there every week, using that
          gym&apos;s courts and start time.
        </p>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save tiers"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
