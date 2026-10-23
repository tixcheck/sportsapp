"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import type { ReversePairsPair } from "@/lib/queries/reverse-pairs";
import { renameTeamAction } from "@/server/actions/teams";
import { removeReversePairAction } from "@/server/actions/reverse-pairs";
import { Input } from "@/components/ui/input";

/**
 * One pair in the field, renamable at any time — including after the draw.
 *
 * Games and standings resolve names by id, so a fixed typo or a changed
 * partner shows everywhere and nothing is redrawn.
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
  const [text, setText] = useState("");

  function open() {
    setText(pair.entryName);
    setEditing(true);
  }

  function save() {
    const name = text.trim();
    if (!name || name === pair.entryName) {
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
      toast.success(`${pair.entryName} removed.`);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <li className="border-rule bg-paper-raised flex w-full items-center gap-1.5 rounded-md border py-1 pr-1 pl-2 text-sm sm:w-auto">
        <Input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder="Sarah & Dylan"
          aria-label={`Names for ${pair.entryName}`}
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
      {pair.entryName}
      <button
        type="button"
        onClick={open}
        disabled={pending}
        aria-label={`Edit name of ${pair.entryName}`}
        className="text-ink-3 hover:text-ink rounded p-0.5"
      >
        <Pencil className="size-3.5" />
      </button>
      {!locked && (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label={`Remove ${pair.entryName}`}
          className="text-ink-3 hover:text-claret rounded p-0.5"
        >
          <X className="size-3.5" />
        </button>
      )}
    </li>
  );
}
