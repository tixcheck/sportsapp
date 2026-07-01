"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { updateKotcSettingsAction } from "@/server/actions/kotc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type SeedMetric = "normalized_placement" | "raw_points";

/** Organizer dialog to edit the event's details (name, venue, address, notes)
 *  and scoring settings post-creation. */
export function EditDetailsDialog(props: {
  competitionId: string;
  name: string;
  venue: string | null;
  location: string | null;
  notes: string | null;
  pairsPerPool: number;
  roundsPerSession: number;
  roundMinutes: number;
  pointCap: number | null;
  seedMetric: SeedMetric;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    name: props.name,
    venue: props.venue ?? "",
    location: props.location ?? "",
    notes: props.notes ?? "",
    pairsPerPool: String(props.pairsPerPool),
    roundsPerSession: String(props.roundsPerSession),
    roundMinutes: String(props.roundMinutes),
    pointCap: props.pointCap == null ? "" : String(props.pointCap),
    seedMetric: props.seedMetric,
  });
  const set = (k: keyof typeof f, v: string) =>
    setF((prev) => ({ ...prev, [k]: v }));

  function save() {
    if (f.name.trim().length < 2) {
      toast.error("Enter a name.");
      return;
    }
    start(async () => {
      const res = await updateKotcSettingsAction(props.competitionId, {
        name: f.name.trim(),
        venue: f.venue.trim(),
        location: f.location.trim(),
        notes: f.notes.trim(),
        pairsPerPool: Number(f.pairsPerPool) || 5,
        roundsPerSession: Number(f.roundsPerSession) || 3,
        roundMinutes: Number(f.roundMinutes) || 15,
        pointCap: f.pointCap.trim() === "" ? null : Number(f.pointCap),
        seedMetric: f.seedMetric,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Details updated.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil /> Edit details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
          <DialogDescription>
            Update what participants see, plus scoring settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Name">
            <Input
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="Venue (short name)">
            <Input
              value={f.venue}
              onChange={(e) => set("venue", e.target.value)}
              placeholder="Woodbine Beach"
            />
          </Field>
          <Field label="Location — full address (adds a map link)">
            <Input
              value={f.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="1675 Lake Shore Blvd E, Toronto"
            />
          </Field>
          <Field label="Notes for participants">
            <textarea
              value={f.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              placeholder="Check-in 8:45am · bring cash for the bar · finals ~4pm"
              className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none"
            />
          </Field>

          <div className="grid grid-cols-3 gap-2">
            <Field label="Pairs/pool">
              <Input
                type="number"
                value={f.pairsPerPool}
                onChange={(e) => set("pairsPerPool", e.target.value)}
              />
            </Field>
            <Field label="Rounds">
              <Input
                type="number"
                value={f.roundsPerSession}
                onChange={(e) => set("roundsPerSession", e.target.value)}
              />
            </Field>
            <Field label="Minutes">
              <Input
                type="number"
                value={f.roundMinutes}
                onChange={(e) => set("roundMinutes", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Point cap (blank = none)">
              <Input
                type="number"
                value={f.pointCap}
                onChange={(e) => set("pointCap", e.target.value)}
                placeholder="—"
              />
            </Field>
            <Field label="Seed metric">
              <div className="flex gap-1">
                {(
                  [
                    ["normalized_placement", "Normalized"],
                    ["raw_points", "Raw pts"],
                  ] as [SeedMetric, string][]
                ).map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => set("seedMetric", val)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium ${
                      f.seedMetric === val
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-surface text-muted-foreground"
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
    </label>
  );
}
