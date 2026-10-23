"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import type { ReversePairsPair } from "@/lib/queries/reverse-pairs";
import { doorLabelOf, renamedPairName } from "@/lib/reverse-pairs/pair-name";
import { renameTeamAction } from "@/server/actions/teams";
import { removeReversePairAction } from "@/server/actions/reverse-pairs";
import { Input } from "@/components/ui/input";

/**
 * One pair in the field, renamable at any time — including after the draw.
 *
 * Renaming is what makes a draw-at-the-door night work: the schedule is drawn
 * against placeholders ("Pair J"), and when a pair picks J the organizer types
 * their names here. Games and standings resolve names by id, so the new name
 * appears everywhere and nothing is redrawn.
 */
export function PairChip({
  pair,
  locked,
}: {
  pair: ReversePairsPair;
  /** A schedule exists, so the pair can't be removed (renaming is fine). */
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const label = doorLabelOf(pair.name);
  const [text, setText] = useState("");

  function open() {
    // A placeholder starts empty; a named pair starts with its names, minus
    // the label the save puts back.
    const shown = label
      ? pair.name.replace(/^Pair \S+$|^\S+ · /, "")
      : pair.name;
    setText(shown);
    setEditing(true);
  }

  function save() {
    const name = renamedPairName(pair.name, text);
    if (!text.trim() || name === pair.name) {
      setEditing(false);
      return;
    }
    start(async () => {
      const res = await renameTeamAction(pair.id, name);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setEditing(false);
      toast.success(`Saved: ${res.name}`);
      router.refresh();
    });
  }

  function remove() {
    start(async () => {
      const res = await removeReversePairAction(pair.id);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`${pair.name} removed.`);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <li className="border-rule bg-paper-raised flex w-full items-center gap-1.5 rounded-md border py-1 pr-1 pl-2 text-sm sm:w-auto">
        {label && <span className="font-medium tabular-nums">{label}</span>}
        <Input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder="Sarah & Dylan"
          aria-label={`Names for ${pair.name}`}
          className="h-7 min-w-0 flex-1 sm:w-48"
          disabled={pending}
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          aria-label="Save name"
          className="text-ink-3 hover:text-ink rounded p-0.5"
        >
          <Check className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          aria-label="Cancel"
          className="text-ink-3 hover:text-ink rounded p-0.5"
        >
          <X className="size-4" />
        </button>
      </li>
    );
  }

  return (
    <li className="border-rule bg-paper-raised flex items-center gap-1 rounded-md border py-1 pr-1 pl-2 text-sm">
      {pair.name}
      <button
        type="button"
        onClick={open}
        disabled={pending}
        aria-label={`Edit name of ${pair.name}`}
        className="text-ink-3 hover:text-ink rounded p-0.5"
      >
        <Pencil className="size-3.5" />
      </button>
      {!locked && (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label={`Remove ${pair.name}`}
          className="text-ink-3 hover:text-claret rounded p-0.5"
        >
          <X className="size-3.5" />
        </button>
      )}
    </li>
  );
}
