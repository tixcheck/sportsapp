"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TeamGroup } from "@/lib/email/team-groups";
import type { MessageTeam } from "@/lib/queries/message-targets";

/**
 * "Which teams?" for a league message (0172): the whole league, or a hand-
 * picked set. A gym on a night selects everyone playing there in one tap —
 * BVL's case was a gym whose times moved — and the list below fine-tunes it.
 */
export function TeamPicker({
  teams,
  groups,
  picked,
  onPickedChange,
}: {
  teams: MessageTeam[];
  groups: TeamGroup[];
  /** null = every team in the league. */
  picked: string[] | null;
  onPickedChange: (ids: string[] | null) => void;
}) {
  const [filter, setFilter] = useState("");
  const shown = teams.filter((t) =>
    t.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const toggle = (id: string) => {
    const cur = picked ?? [];
    onPickedChange(
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  };

  return (
    <div className="space-y-2">
      <Label>Which teams?</Label>
      <div className="flex gap-2">
        {(
          [
            [null, "All teams"],
            [[], "Pick teams"],
          ] as const
        ).map(([value, label]) => {
          const on = value === null ? picked === null : picked !== null;
          return (
            <button
              key={label}
              type="button"
              onClick={() =>
                onPickedChange(value === null ? null : (picked ?? []))
              }
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                on
                  ? "border-primary bg-accent font-medium"
                  : "border-border bg-surface hover:bg-muted",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div className="space-y-2">
          {groups.length > 0 && (
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">
                Everyone playing at a gym on a night:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {groups.map((g) => (
                  <button
                    key={g.label}
                    type="button"
                    onClick={() =>
                      onPickedChange([...new Set([...picked, ...g.teamIds])])
                    }
                    className="border-border bg-surface hover:bg-muted rounded-full border px-2.5 py-1 text-left text-xs break-words"
                  >
                    + {g.label} ({g.teamIds.length})
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a team"
              className="h-8 text-sm"
            />
            {picked.length > 0 && (
              <button
                type="button"
                onClick={() => onPickedChange([])}
                className="text-muted-foreground hover:text-foreground shrink-0 text-xs underline"
              >
                Clear ({picked.length})
              </button>
            )}
          </div>
          {picked.length > 0 && (
            // The list is alphabetical, so a gym's teams land out of sight;
            // name them here so the organizer sees who they're about to email.
            <p className="text-muted-foreground text-xs break-words">
              Picked:{" "}
              {teams
                .filter((t) => picked.includes(t.id))
                .map((t) => t.name)
                .join(", ")}
            </p>
          )}
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {shown.map((t) => {
              const on = picked.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md border px-2.5 py-1.5 text-left text-sm",
                    on
                      ? "border-primary bg-accent"
                      : "border-border bg-surface hover:bg-muted",
                  )}
                >
                  <span className="min-w-0 flex-1 break-words">{t.name}</span>
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded border",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border",
                    )}
                  >
                    {on && <Check className="size-3" />}
                  </span>
                </button>
              );
            })}
            {shown.length === 0 && (
              <p className="text-muted-foreground px-1 text-xs">
                No team matches “{filter}”.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
