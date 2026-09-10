"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { setNightLineupAction } from "@/server/actions/appearances";
import type { TeamLineup } from "@/lib/queries/lineups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Row = {
  key: string;
  userId: string | null;
  name: string;
  onRoster: boolean;
  played: boolean;
};

/**
 * One team's lineup for one night.
 *
 * Unticking is the normal action, not ticking: on most nights everybody turns
 * up, so the roster arrives pre-ticked and an organizer marks the exceptions.
 * A sub is added by name, which is the only thing anyone knows about them on a
 * Tuesday — they may have no account, and demanding one would mean the night
 * goes unrecorded instead.
 */
export function NightLineupCard({
  competitionId,
  night,
  team,
}: {
  competitionId: string;
  night: string;
  team: TeamLineup;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    team.players.map((p, i) => ({
      key: p.userId ?? `guest-${i}-${p.name}`,
      userId: p.userId,
      name: p.name,
      onRoster: p.onRoster,
      played: p.played,
    })),
  );
  const [subName, setSubName] = useState("");
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const playing = rows.filter((r) => r.played);

  const toggle = (key: string) =>
    setRows((rs) =>
      rs.map((r) => (r.key === key ? { ...r, played: !r.played } : r)),
    );

  const addSub = () => {
    const name = subName.trim();
    if (!name) return;
    setRows((rs) => [
      ...rs,
      {
        key: `guest-${Date.now()}-${name}`,
        userId: null,
        name,
        onRoster: false,
        played: true,
      },
    ]);
    setSubName("");
    setState({ kind: "idle" });
  };

  const removeSub = (key: string) =>
    setRows((rs) => rs.filter((r) => r.key !== key));

  async function save() {
    setState({ kind: "saving" });
    const result = await setNightLineupAction({
      competitionId,
      teamId: team.teamId,
      night,
      players: playing.map((r) => ({
        userId: r.userId,
        name: r.name,
        role: r.onRoster ? "rostered" : "sub",
      })),
    });
    if ("error" in result) {
      setState({ kind: "error", message: result.error });
      return;
    }
    setState({ kind: "saved" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{team.teamName}</CardTitle>
        <CardDescription>
          {playing.length} playing ·{" "}
          {team.matchCount === 1 ? "1 game" : `${team.matchCount} games`} this
          night
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nobody is on this roster yet. Add whoever played as a sub.
          </p>
        ) : (
          <ul className="grid gap-1">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-2">
                <label className="flex flex-1 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={r.played}
                    onChange={() => toggle(r.key)}
                    className="size-4"
                  />
                  <span className={r.played ? "" : "text-muted-foreground"}>
                    {r.name}
                  </span>
                  {!r.onRoster && (
                    <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                      Sub
                    </span>
                  )}
                </label>
                {!r.onRoster && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSub(r.key)}
                    aria-label={`Remove ${r.name}`}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor={`sub-${team.teamId}`}>Add a sub</Label>
          <div className="flex gap-2">
            <Input
              id={`sub-${team.teamId}`}
              value={subName}
              placeholder="Their name"
              onChange={(e) => setSubName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSub();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addSub}>
              <Plus className="size-4" />
              Add
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={state.kind === "saving"}>
            {state.kind === "saving" ? "Saving…" : "Save lineup"}
          </Button>
          {state.kind === "saved" && (
            <span className="text-pine text-sm">
              Saved for all{" "}
              {team.matchCount === 1 ? "1 game" : `${team.matchCount} games`}.
            </span>
          )}
          {state.kind === "error" && (
            <span className="text-destructive text-sm">{state.message}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
