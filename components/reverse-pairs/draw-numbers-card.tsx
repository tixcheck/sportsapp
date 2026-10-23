"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { ReversePairsPair } from "@/lib/queries/reverse-pairs";
import { numbersLeft, parseDrawNumber } from "@/lib/reverse-pairs/draw-number";
import { setReversePairNumberAction } from "@/server/actions/reverse-pairs";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Numbers drawn at the door (0187): every entered pair, with a box for the
 * number it picked. Saving puts the pair into that number's games, so the
 * schedule and standings fill in as pairs arrive.
 *
 * Alphabetical by pair, because the organizer is looking up the pair in front
 * of them, not the number.
 */
export function DrawNumbersCard({ pairs }: { pairs: ReversePairsPair[] }) {
  const numbered = pairs.filter((p) => p.drawNumber !== null);
  const max = Math.max(0, ...numbered.map((p) => p.drawNumber!));
  const left = numbersLeft(numbered);
  const byName = [...numbered].sort((a, b) =>
    a.entryName.localeCompare(b.entryName),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Pair numbers
          <span className="text-ink-3 ml-2 text-sm font-normal tabular-nums">
            {numbered.length - left.length} of {numbered.length}
          </span>
        </CardTitle>
        <CardDescription>
          {left.length === 0
            ? "Every pair has its number."
            : `Type the number each pair picks. Still to give out: ${left.join(", ")}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-rule divide-y">
          {byName.map((p) => (
            <NumberRow
              // Re-mount when the saved number changes, so the box shows it.
              key={`${p.id}:${p.drawNumberSet ? p.drawNumber : ""}`}
              pair={p}
              max={max}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function NumberRow({ pair, max }: { pair: ReversePairsPair; max: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const saved = pair.drawNumberSet ? String(pair.drawNumber) : "";
  const [text, setText] = useState(saved);

  function save() {
    if (text.trim() === saved) return;
    const parsed = parseDrawNumber(text, max);
    if ("error" in parsed) {
      toast.error(parsed.error);
      setText(saved);
      return;
    }
    start(async () => {
      const res = await setReversePairNumberAction({
        teamId: pair.id,
        number: parsed.number,
      });
      if ("error" in res) {
        toast.error(res.error);
        setText(saved);
        return;
      }
      toast.success(
        parsed.number === null
          ? `${pair.entryName}: number cleared.`
          : `${pair.entryName} is number ${parsed.number}.`,
      );
      router.refresh();
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="min-w-0 truncate text-sm">{pair.entryName}</span>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        inputMode="numeric"
        placeholder="#"
        aria-label={`Number for ${pair.entryName}`}
        disabled={pending}
        className="h-9 w-16 shrink-0 text-center tabular-nums"
      />
    </li>
  );
}
