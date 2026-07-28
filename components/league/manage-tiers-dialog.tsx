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

type Row = { id?: string; name: string };

/**
 * Manage a league's tiers (skill divisions). Each tier is its own mini-league —
 * teams play only within their tier, with a separate schedule and standings.
 * Removing a tier un-sorts its teams (they aren't deleted); regenerate the
 * schedule after changing tiers.
 */
export function ManageTiersDialog({
  competitionId,
  tiers,
}: {
  competitionId: string;
  tiers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(tiers);
  const [pending, start] = useTransition();

  function reset() {
    setRows(tiers);
  }

  function save() {
    const cleaned = rows
      .map((r) => ({ ...r, name: r.name.trim() }))
      .filter((r) => r.name.length > 0);
    start(async () => {
      const res = await manageLeagueTiersAction({
        competitionId,
        tiers: cleaned,
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
          {rows.map((r, i) => (
            <div key={r.id ?? `new-${i}`} className="flex items-center gap-2">
              <Input
                value={r.name}
                placeholder={`Tier ${i + 1}`}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((x, k) =>
                      k === i ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
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
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRows((prev) => [...prev, { name: "" }])}
          >
            <Plus className="size-4" /> Add tier
          </Button>
        </div>

        <p className="text-muted-foreground text-xs">
          Removing a tier un-sorts its teams (they aren&apos;t deleted).
          Changing tiers takes effect the next time you generate the schedule.
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
