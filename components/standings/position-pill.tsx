"use client";

import { useState } from "react";

import type { TiebreakerExplainer } from "@/lib/standings/compute";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * The signature tappable position pill (DESIGN §6). Opens the OVA-style
 * tiebreaker modal: the step that resolved this team's spot and the exact
 * values used, listing every team it was tied with.
 */
export function PositionPill({
  position,
  teamName,
  explainer,
}: {
  position: number;
  teamName: string;
  explainer: TiebreakerExplainer;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Why is ${teamName} ranked ${position}?`}
          className="bg-coral-600 hover:bg-coral-700 grid size-7 place-items-center rounded-full text-xs font-semibold text-white tabular-nums transition-colors"
        >
          {position}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {teamName} · position {position}
          </DialogTitle>
          <DialogDescription>{explainer.heading}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 text-sm">
          {explainer.entries.map((e, i) => (
            <li
              key={i}
              className={cn(
                "flex items-center justify-between gap-4 rounded-md px-2 py-1.5",
                e.highlighted
                  ? "bg-accent text-coral-900 font-medium"
                  : "text-muted-foreground",
              )}
            >
              <span className="truncate">{e.teamName}</span>
              <span className="tabular-nums">{e.detail}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
