"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import type { ReversePairsPair } from "@/lib/queries/reverse-pairs";
import {
  addReversePairsAction,
  removeReversePairAction,
} from "@/server/actions/reverse-pairs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The field.
 *
 * A textarea of names rather than a row of inputs, because an organizer arrives
 * with a registration list already written down somewhere and the fastest path
 * from that list to this screen is a paste. One pair per line, however they
 * write them.
 */
export function ReversePairsPairsCard({
  competitionId,
  pairs,
  courts,
  locked,
}: {
  competitionId: string;
  pairs: ReversePairsPair[];
  courts: number;
  /** A schedule exists, so removing a pair would break it. */
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");

  const needed = courts * 6;
  const short = needed - pairs.length;

  function add() {
    const names = text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) {
      toast.error("Enter at least one pair.");
      return;
    }
    start(async () => {
      const res = await addReversePairsAction({ competitionId, names });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setText("");
      toast.success(
        `${res.added} pair${res.added === 1 ? "" : "s"} added` +
          (res.skipped ? `, ${res.skipped} already in the field.` : "."),
      );
      router.refresh();
    });
  }

  function remove(teamId: string, name: string) {
    start(async () => {
      const res = await removeReversePairAction(teamId);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`${name} removed.`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Pairs
          <span className="text-ink-3 ml-2 text-sm font-normal tabular-nums">
            {pairs.length}
          </span>
        </CardTitle>
        <CardDescription>
          {short > 0 ? (
            <>
              {courts} court{courts === 1 ? "" : "s"} needs {needed} pairs on
              court — {short} more to go.
            </>
          ) : (
            <>
              Enough for {courts} court{courts === 1 ? "" : "s"}
              {pairs.length > needed && (
                <> · {pairs.length - needed} sitting out each round</>
              )}
              .
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pairs.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {pairs.map((p) => (
              <li
                key={p.id}
                className="border-rule bg-paper-raised flex items-center gap-1 rounded-md border py-1 pr-1 pl-2 text-sm"
              >
                {p.name}
                {!locked && (
                  <button
                    type="button"
                    onClick={() => remove(p.id, p.name)}
                    disabled={pending}
                    aria-label={`Remove ${p.name}`}
                    className="text-ink-3 hover:text-claret rounded p-0.5"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="rp-pairs">Add pairs — one per line</Label>
          <textarea
            id="rp-pairs"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={"Sam & Mel\nMike & Pris\nBrandon & Ash"}
            className="border-input bg-surface min-h-24 rounded-md border px-3 py-2 text-sm"
          />
          <p className="text-ink-3 text-xs">
            Paste your registration list. Names already in the field are
            skipped.
          </p>
        </div>

        <Button onClick={add} disabled={pending || !text.trim()}>
          <Plus className="size-4" />
          {pending ? "Adding…" : "Add pairs"}
        </Button>

        {locked && pairs.length > 0 && (
          <p className="text-ink-3 text-xs">
            A schedule is drawn, so pairs can&rsquo;t be removed without
            redrawing it.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
