"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Pencil, Plus, UserPlus, Users, X } from "lucide-react";

import {
  addPlayerToPoolAction,
  createTeamFromFreeAgentsAction,
  placeFreeAgentsAction,
  removeFreeAgentAction,
  setFreeAgentStatusAction,
} from "@/server/actions/free-agents";
import type { FreeAgent } from "@/lib/queries/free-agents";
import type { Sport } from "@/lib/formats";
import { SKILL_LEVELS, sportConfig } from "@/lib/sports";
import { EditSignupDialog } from "@/components/registration/edit-signup-dialog";
import { DEFAULT_GROUP_ORDER } from "@/lib/draft/snake";
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
 * Putting somebody into the pool by hand.
 *
 * A league whose captains draft from a list the organizer already holds has
 * nobody signing themselves up, so without this the pool stays empty and the
 * draft board has nothing to show. The RPC behind it has existed since
 * migration 0090 with nothing calling it.
 *
 * Positions lead the form for the same reason they lead each row: the board
 * groups the pool into position columns, and that grouping is what a captain
 * reads when picking. Email is optional — a name off a sheet usually arrives
 * without one, which is the case migration 0129 had to fix.
 *
 * Stays open after each save. Eighteen names is eighteen rounds of this form,
 * and closing it every time would be eighteen extra clicks.
 */
function AddPlayerPanel({
  competitionId,
  sport,
  onAdded,
}: {
  competitionId: string;
  sport: Sport;
  onAdded: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [level, setLevel] = useState("");
  const positions = sportConfig(sport).positions;

  function submit() {
    if (!name.trim()) {
      toast.error("Give them a name.");
      return;
    }
    if (!level) {
      toast.error("Pick the level that fits them best.");
      return;
    }
    start(async () => {
      const res = await addPlayerToPoolAction({
        competitionId,
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        positions: chosen,
        skillLevel: level,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      const added = name.trim();
      // Only the person clears. The level usually repeats down a list, and
      // retyping it eighteen times is the kind of thing that stops it being
      // filled in at all.
      setName("");
      setEmail("");
      setPhone("");
      setChosen([]);
      onAdded(added);
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Add a player
      </Button>
    );
  }

  return (
    <div className="border-border bg-surface grid gap-3 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="ap-name">Name</Label>
          <Input
            id="ap-name"
            value={name}
            maxLength={120}
            placeholder="Akshat Shah"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ap-email">
            Email <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="ap-email"
            type="email"
            value={email}
            maxLength={254}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ap-phone">
            Phone <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="ap-phone"
            value={phone}
            maxLength={40}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>

      {positions.length > 0 && (
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">
            Positions
            <span className="text-muted-foreground font-normal">
              {" "}
              — what the captains sort the board by
            </span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {positions.map((p) => {
              const on = chosen.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  disabled={pending}
                  onClick={() =>
                    setChosen(
                      on ? chosen.filter((x) => x !== p) : [...chosen, p],
                    )
                  }
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface hover:bg-paper-sunken",
                  )}
                >
                  {on && <Check className="size-3.5" />}
                  {p}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Level</legend>
        <div className="flex flex-wrap gap-2">
          {SKILL_LEVELS.map((l) => {
            const on = level === l.value;
            return (
              <button
                key={l.value}
                type="button"
                aria-pressed={on}
                disabled={pending}
                onClick={() => setLevel(l.value)}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface hover:bg-paper-sunken",
                )}
              >
                {on && <Check className="size-3.5" />}
                {l.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={submit} disabled={pending || !name.trim()}>
          {pending ? "Adding…" : "Add to pool"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Done
        </Button>
      </div>
    </div>
  );
}

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
  sport,
}: {
  competitionId: string;
  /** Which positions the edit form offers. */
  sport: Sport;
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
  const [editing, setEditing] = useState<FreeAgent | null>(null);
  // Deleting a sign-up cannot be undone, so it takes two taps rather than a
  // dialog: the pool is a list people scroll on a phone.
  const [confirming, setConfirming] = useState<string | null>(null);

  /**
   * The pool by position — an organizer building teams is counting setters and
   * middles, not reading one long alphabetical list. A player's FIRST position
   * is their column (the same rule the draft uses), with any second listed
   * under their name so a setter who also plays outside is still findable.
   *
   * Columns follow the standard order, then anything unexpected, so a position
   * nobody planned for still shows its players rather than losing them.
   */
  const columns = (() => {
    const byPosition = new Map<string, FreeAgent[]>();
    for (const a of agents) {
      const key = a.positions[0] ?? "No position given";
      const list = byPosition.get(key);
      if (list) list.push(a);
      else byPosition.set(key, [a]);
    }
    const known = DEFAULT_GROUP_ORDER.filter((p) => byPosition.has(p));
    const rest = [...byPosition.keys()].filter(
      (p) => !(DEFAULT_GROUP_ORDER as readonly string[]).includes(p),
    );
    return [...known, ...rest].map((position) => ({
      position,
      players: byPosition.get(position)!,
    }));
  })();

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
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Nobody has signed up on their own yet — add them yourself if you
            already have the names.
          </p>
          <AddPlayerPanel
            competitionId={competitionId}
            sport={sport}
            onAdded={(n) => done(`${n} added to the pool.`)}
          />
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

  /**
   * Delete a sign-up outright. Refused by the action once money has moved,
   * because the payment rows cascade off this one — the toast then says so.
   */
  function remove(id: string, name: string) {
    if (confirming !== id) {
      setConfirming(id);
      return;
    }
    startTransition(async () => {
      const result = await removeFreeAgentAction({ freeAgentId: id });
      setConfirming(null);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      done(`${name} removed.`);
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
          {withdrawn.length > 0 && ` · ${withdrawn.length} withdrawn`}. Withdraw
          takes someone out of the pool but keeps their sign-up and payment
          record; Remove deletes both, and refuses for anything paid through the
          platform.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Above the pool, not below it: an organizer entering a list works
            top-down, and the eighteenth name should not be a scroll away. */}
        <AddPlayerPanel
          competitionId={competitionId}
          sport={sport}
          onAdded={(n) => done(`${n} added to the pool.`)}
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {columns.map(({ position, players }) => (
            <div
              key={position}
              className="border-rule bg-surface flex flex-col gap-2 rounded-lg border p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">{position}</h3>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {players.length}
                </span>
              </div>

              <ul className="divide-rule divide-y">
                {players.map((a) => {
                  const on = selected.has(a.id);
                  const selectable = a.status === "available";
                  return (
                    <li
                      key={a.id}
                      className={cn(
                        // Wraps: the controls below carry ~200px of fixed
                        // width, and a position column at xl is ~260px. Without
                        // this the name is the only child that can shrink, and
                        // it collapses to a single character.
                        "flex flex-wrap items-start gap-2 py-2",
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

                      {/* Claims a real width rather than `min-w-0`, which let
                          it be squeezed to nothing. The buttons wrap instead. */}
                      <div className="min-w-[8rem] flex-1">
                        <p className="truncate text-sm font-medium">{a.name}</p>
                        {/* Only the SECOND position — the first is the column. */}
                        {a.positions.length > 1 && (
                          <p className="text-muted-foreground truncate text-xs">
                            also {a.positions.slice(1).join(" · ")}
                          </p>
                        )}
                        {a.status === "placed" && (
                          <span className="bg-paper-sunken text-ink-2 mt-1 inline-block rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                            {a.placedTeamName ?? "Placed"}
                          </span>
                        )}
                        {a.status === "pending_payment" && (
                          <span className="mt-1 inline-block rounded-[4px] bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-800 uppercase">
                            Unpaid
                          </span>
                        )}
                      </div>

                      {/* One group, so the three wrap together onto a second
                          line instead of breaking apart raggedly, and stay
                          right-aligned when they do. */}
                      <div className="ml-auto flex shrink-0 items-center gap-1">
                        {/* Correcting a spelling or a phone number shouldn't
                            mean leaving the pool the organizer is placing
                            from. */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground shrink-0 px-2"
                          disabled={pending}
                          onClick={() => setEditing(a)}
                          aria-label={`Edit ${a.name}`}
                        >
                          <Pencil className="size-4" />
                        </Button>

                        {/* Withdraw and Restore are mutually exclusive, so this
                            is one slot. Withdrawing is reversible (Restore is
                            right here), so it takes no confirm step, unlike the
                            X beside it. It is also the ONLY way out for a
                            sign-up paid through the platform: that delete
                            refuses, because the payment rows cascade off this
                            one. The label stays a word rather than an icon —
                            nobody found this control when it did not exist, and
                            an unlabelled one would repeat that. */}
                        {a.status === "withdrawn" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            disabled={pending}
                            onClick={() => setStatus(a.id, "available")}
                          >
                            Restore
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            disabled={pending}
                            onClick={() => setStatus(a.id, "withdrawn")}
                            aria-label={`Withdraw ${a.name}`}
                          >
                            Withdraw
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className={cn(
                            "shrink-0 px-2",
                            confirming === a.id
                              ? "text-claret"
                              : "text-muted-foreground",
                          )}
                          disabled={pending}
                          onClick={() => remove(a.id, a.name)}
                          aria-label={
                            confirming === a.id
                              ? `Confirm removing ${a.name}`
                              : `Remove ${a.name}`
                          }
                        >
                          {confirming === a.id ? (
                            <span className="text-xs font-medium">
                              Remove for good?
                            </span>
                          ) : (
                            <X className="size-4" />
                          )}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

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
      {editing && (
        <EditSignupDialog
          key={editing.id}
          agent={editing}
          sport={sport}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}
