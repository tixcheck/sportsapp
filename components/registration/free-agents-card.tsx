"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, UserPlus, Users } from "lucide-react";

import {
  createTeamFromFreeAgentsAction,
  placeFreeAgentsAction,
  setFreeAgentStatusAction,
} from "@/server/actions/free-agents";
import type { FreeAgent } from "@/lib/queries/free-agents";
import { skillLabel } from "@/lib/sports";
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
import { cn } from "@/lib/utils";

/**
 * The organizer's view of everyone who signed up without a team.
 *
 * The list is the product here — an organizer building teams is reading
 * positions and levels down a column, so those lead each row rather than
 * hiding behind a click. Placement is the one action, offered two ways: form a
 * new team from a selection, or top up a team that is short.
 */
export function FreeAgentsCard({
  competitionId,
  agents,
  teams,
  divisions,
}: {
  competitionId: string;
  agents: FreeAgent[];
  teams: { id: string; name: string }[];
  divisions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [teamName, setTeamName] = useState("");
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? "");
  const [targetTeam, setTargetTeam] = useState(teams[0]?.id ?? "");

  const pool = agents.filter((a) => a.status === "available");
  const placed = agents.filter((a) => a.status === "placed");
  const unpaid = agents.filter((a) => a.status === "pending_payment");
  const withdrawn = agents.filter((a) => a.status === "withdrawn");

  if (agents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Free agents</CardTitle>
          <CardDescription>
            Players who sign up without a team appear here, with the positions
            they play and the level they put themselves at.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Nobody has signed up on their own yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function done(message: string) {
    toast.success(message);
    setSelected(new Set());
    setTeamName("");
    router.refresh();
  }

  function formTeam() {
    if (selected.size === 0) return toast.error("Pick at least one player.");
    if (!teamName.trim()) return toast.error("Give the team a name.");
    startTransition(async () => {
      const result = await createTeamFromFreeAgentsAction({
        competitionId,
        teamName: teamName.trim(),
        divisionId: divisionId || null,
        freeAgentIds: [...selected],
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      done(`Team created with ${result.placed} player(s).`);
    });
  }

  function addToTeam() {
    if (selected.size === 0) return toast.error("Pick at least one player.");
    if (!targetTeam) return toast.error("Pick a team.");
    startTransition(async () => {
      const result = await placeFreeAgentsAction({
        teamId: targetTeam,
        freeAgentIds: [...selected],
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      done(`${result.placed} player(s) added.`);
    });
  }

  function setStatus(id: string, status: "available" | "withdrawn") {
    startTransition(async () => {
      const result = await setFreeAgentStatusAction({
        freeAgentId: id,
        status,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      done(
        status === "withdrawn" ? "Removed from the pool." : "Back in the pool.",
      );
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Free agents</CardTitle>
        <CardDescription>
          {pool.length} waiting to be placed
          {placed.length > 0 && ` · ${placed.length} placed`}
          {unpaid.length > 0 && ` · ${unpaid.length} awaiting payment`}
          {withdrawn.length > 0 && ` · ${withdrawn.length} withdrawn`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <ul className="divide-rule divide-y">
          {agents.map((a) => {
            const on = selected.has(a.id);
            const selectable = a.status === "available";
            return (
              <li
                key={a.id}
                className={cn(
                  "flex flex-wrap items-start gap-3 py-3",
                  a.status === "withdrawn" && "opacity-60",
                )}
              >
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={`Select ${a.name}`}
                  disabled={!selectable || pending}
                  onClick={() => toggle(a.id)}
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border transition-colors",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface",
                    !selectable && "cursor-not-allowed opacity-40",
                  )}
                >
                  {on && <Check className="size-3.5" />}
                </button>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {a.name}
                    <span className="text-muted-foreground ml-2 text-xs font-normal">
                      {skillLabel(a.skillLevel)}
                    </span>
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {a.positions.length > 0
                      ? a.positions.join(" · ")
                      : "No positions given"}
                  </p>
                  {a.notes && (
                    <p className="text-ink-2 mt-1 text-xs italic">
                      &ldquo;{a.notes}&rdquo;
                    </p>
                  )}
                  <p className="text-muted-foreground mt-1 text-xs">
                    {a.email}
                    {a.phone ? ` · ${a.phone}` : ""}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {a.status === "placed" && (
                    <span className="bg-paper-sunken text-ink-2 rounded-[4px] px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                      {a.placedTeamName ?? "Placed"}
                    </span>
                  )}
                  {a.status === "pending_payment" && (
                    <span className="rounded-[4px] bg-amber-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-800 uppercase">
                      Unpaid
                    </span>
                  )}
                  {a.status === "withdrawn" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => setStatus(a.id, "available")}
                    >
                      Restore
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setStatus(a.id, "withdrawn")}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="border-border grid gap-4 rounded-lg border p-3">
          <p className="text-sm font-medium">
            {selected.size === 0
              ? "Select players above to place them"
              : `${selected.size} selected`}
          </p>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="fa-team-name">Form a new team</Label>
              <Input
                id="fa-team-name"
                placeholder="Free Agents 1"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
            </div>
            <Button
              onClick={formTeam}
              disabled={pending || selected.size === 0}
              className="sm:mb-0"
            >
              <Users className="size-4" />
              Create team
            </Button>
          </div>

          {divisions.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="fa-division">Tier / division</Label>
              <select
                id="fa-division"
                value={divisionId}
                onChange={(e) => setDivisionId(e.target.value)}
                className="border-input bg-surface h-9 rounded-md border px-3 text-sm"
              >
                <option value="">No tier</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {teams.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="grid gap-1.5">
                <Label htmlFor="fa-target">Or add to an existing team</Label>
                <select
                  id="fa-target"
                  value={targetTeam}
                  onChange={(e) => setTargetTeam(e.target.value)}
                  className="border-input bg-surface h-9 rounded-md border px-3 text-sm"
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="outline"
                onClick={addToTeam}
                disabled={pending || selected.size === 0}
              >
                <UserPlus className="size-4" />
                Add to team
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
