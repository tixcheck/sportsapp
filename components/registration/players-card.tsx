"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import type {
  AnswerMap,
  PlayerDirectoryRow,
  RegistrationQuestion,
} from "@/lib/queries/registration-questions";
import type { OrgPerson } from "@/lib/registration/org-people";
import { savePlayerAnswersAction } from "@/server/actions/registration-questions";
import {
  addOrgPersonAction,
  addPlayerToPoolAction,
  searchOrgPeopleAction,
  updateFreeAgentDetailsAction,
} from "@/server/actions/free-agents";
import type { Sport } from "@/lib/formats";
import {
  SignupDetailsFields,
  toSignupDetails,
  type SignupDetails,
} from "@/components/registration/signup-details-fields";
import { QuestionFields } from "@/components/registration/question-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Everyone registered, and their answers — editable by the organizer.
 *
 * Asked for in as many words: "access to player data (to add phone numbers,
 * tweak spellings, etc.)". A misspelt surname is the organizer's problem to
 * fix on a Tuesday night, and telling them to get the player to log in and do
 * it themselves is how a league goes back to a spreadsheet.
 *
 * Shows the roster, not the answers, so a player who has joined a team and
 * filled in nothing still appears. They are the person an organizer is most
 * likely to be looking for.
 */
export function PlayersCard({
  competitionId,
  players,
  questions,
  addressAutocomplete,
  sport,
}: {
  competitionId: string;
  /** Which positions a sign-up can hold. */
  sport: Sport;
  players: PlayerDirectoryRow[];
  /** Player-scope questions only — a team answer is not edited from here. */
  questions: RegistrationQuestion[];
  addressAutocomplete: boolean;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<PlayerDirectoryRow | null>(null);
  const [adding, setAdding] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) =>
      [p.name, p.accountName, p.email, p.teamName]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [players, query]);

  // Narrow enough to stay readable on a phone; the dialog holds the rest.
  const columns = questions.slice(0, 3);

  return (
    <Card>
      {/* The button belongs up here, not in the content: the content
          short-circuits when nobody is registered yet, which is precisely when
          an organizer needs to add the first person. */}
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" />
            Players
          </CardTitle>
          <CardDescription>
            Everyone on a roster, plus individuals still waiting to be placed.
            Edit anything that needs correcting — a phone number, a spelling.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" />
          Add a player
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {players.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nobody is registered yet. Players appear here as teams fill up — or
            add them yourself if you already have the names.
          </p>
        ) : (
          <>
            <div className="relative max-w-72">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email or team"
                className="pl-8"
                aria-label="Search players"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-rule border-b text-left text-xs tracking-wide uppercase">
                    <th className="p-2 font-semibold">Player</th>
                    <th className="p-2 font-semibold">Team</th>
                    {columns.map((q) => (
                      <th key={q.id} className="p-2 font-semibold">
                        {q.label}
                      </th>
                    ))}
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr
                      key={p.userId ?? p.freeAgentId}
                      className="border-rule/60 border-b"
                    >
                      <td className="p-2">
                        <span className="text-foreground block font-medium">
                          {p.name}
                        </span>
                        {p.email && (
                          <span className="text-muted-foreground block text-xs">
                            {p.email}
                          </span>
                        )}
                      </td>
                      <td className="text-muted-foreground p-2">
                        {p.teamName ?? (
                          <span className="text-ink-2">
                            {p.freeAgentStatus === "pending_payment"
                              ? "Individual · unpaid"
                              : "Individual — not on a team yet"}
                          </span>
                        )}
                        {p.draft && p.draft.positions.length > 0 && (
                          <span className="block text-xs">
                            {p.draft.positions.join(", ")}
                          </span>
                        )}
                      </td>
                      {columns.map((q) => (
                        <td key={q.id} className="p-2">
                          {p.answers[q.id] ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      ))}
                      <td className="p-2 text-right">
                        {/* Editable whenever there is something to edit:
                            league answers need an account, sign-up details
                            need a sign-up. Only an invite-joined player with
                            no account has neither. */}
                        {(p.userId || p.freeAgentId) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditing(p)}
                            aria-label={`Edit ${p.name}`}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filtered.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Nobody matches &ldquo;{query}&rdquo;.
              </p>
            )}
          </>
        )}
      </CardContent>

      {adding && (
        <AddPlayerDialog
          competitionId={competitionId}
          sport={sport}
          onClose={() => setAdding(false)}
        />
      )}

      {editing && (
        <EditPlayerDialog
          key={editing.userId ?? editing.freeAgentId}
          competitionId={competitionId}
          player={editing}
          questions={questions}
          addressAutocomplete={addressAutocomplete}
          sport={sport}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function EditPlayerDialog({
  competitionId,
  player,
  questions,
  addressAutocomplete,
  sport,
  onClose,
}: {
  competitionId: string;
  player: PlayerDirectoryRow;
  questions: RegistrationQuestion[];
  addressAutocomplete: boolean;
  sport: Sport;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [values, setValues] = useState<AnswerMap>(player.answers);
  const [meta, setMeta] = useState<Record<string, Record<string, unknown>>>({});
  const [details, setDetails] = useState<SignupDetails>(() =>
    toSignupDetails({
      // The name AS SIGNED UP, not the row's resolved league name - seeding
      // from that would rewrite the sign-up's spelling on save.
      name: player.draft?.name ?? player.name,
      email: player.draft?.email ?? player.email,
      phone: player.draft?.phone ?? null,
      positions: player.draft?.positions ?? [],
      skillLevel: player.draft?.skillLevel ?? null,
      notes: player.draft?.notes ?? null,
    }),
  );

  const editsSignup = player.freeAgentId != null;
  // An account can hold answers; the questions may not exist for this league.
  const editsAnswers = player.userId != null && questions.length > 0;

  function save() {
    start(async () => {
      if (player.freeAgentId) {
        const res = await updateFreeAgentDetailsAction({
          freeAgentId: player.freeAgentId,
          ...details,
        });
        if ("error" in res) {
          toast.error(res.error);
          return;
        }
      }
      if (editsAnswers && player.userId) {
        const res = await savePlayerAnswersAction({
          competitionId,
          userId: player.userId,
          answers: values,
          metadata: Object.keys(meta).length > 0 ? meta : undefined,
        });
        if ("error" in res) {
          toast.error(res.error);
          return;
        }
      }
      toast.success(`Saved ${editsSignup ? details.name : player.name}.`);
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{player.name}</DialogTitle>
          <DialogDescription>
            {player.teamName ??
              (player.freeAgentStatus === "pending_payment"
                ? "Individual · hasn't paid yet"
                : "Individual — not on a team yet")}
            {player.accountName && ` · signs in as ${player.accountName}`}
          </DialogDescription>
        </DialogHeader>

        {editsSignup && (
          <section className="grid gap-3">
            <h3 className="text-sm font-semibold">Sign-up details</h3>
            <SignupDetailsFields
              sport={sport}
              value={details}
              onChange={setDetails}
              disabled={pending}
            />
          </section>
        )}

        {editsAnswers ? (
          <section className="grid gap-3">
            <h3 className="text-sm font-semibold">League questions</h3>
            <QuestionFields
              questions={questions}
              values={values}
              onChange={(id, value) =>
                setValues((prev) => ({ ...prev, [id]: value }))
              }
              onMeta={(id, m) => setMeta((prev) => ({ ...prev, [id]: m }))}
              disabled={pending}
              addressAutocomplete={addressAutocomplete}
            />
          </section>
        ) : (
          editsSignup &&
          player.userId == null && (
            <p className="text-muted-foreground text-xs">
              No account, so there are no league answers to edit - only the
              details they signed up with.
            </p>
          )
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const BLANK: SignupDetails = {
  name: "",
  email: "",
  phone: "",
  positions: [],
  skillLevel: "",
  notes: "",
};

/**
 * Adding a player, searching the organization's own people first.
 *
 * An organizer starting a drafted league is rarely starting from strangers —
 * Mango's Friday eighteen mostly play in their Tuesday league already. Typing
 * a name and email the org is demonstrably already holding is slow, and it is
 * how two spellings of one person come to exist.
 *
 * The search covers past individuals AND rostered players: a team-entry org has
 * no free agents at all, so searching sign-ups alone would find nobody for
 * exactly the organizer this is for. It never reaches beyond this org — being
 * able to type an email and learn whether it has an account is not something an
 * organizer should be able to do.
 *
 * Stays open after each add, and drops the person from the results, so a list
 * of eighteen is eighteen clicks rather than eighteen round trips.
 */
function AddPlayerDialog({
  competitionId,
  sport,
  onClose,
}: {
  competitionId: string;
  sport: Sport;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [term, setTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<OrgPerson[] | null>(null);
  const [manual, setManual] = useState<SignupDetails | null>(null);

  function search() {
    const q = term.trim();
    if (!q) return;
    setSearching(true);
    void searchOrgPeopleAction({ competitionId, query: q }).then((res) => {
      setSearching(false);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setResults(res.people);
    });
  }

  function addFound(person: OrgPerson) {
    start(async () => {
      const res = await addOrgPersonAction({
        competitionId,
        userId: person.userId,
        sourceFreeAgentId: person.freeAgentId,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.name} added to the pool.`);
      setResults((cur) => (cur ?? []).filter((p) => p !== person));
      router.refresh();
    });
  }

  function addManual() {
    if (!manual) return;
    if (!manual.name.trim()) {
      toast.error("Give them a name.");
      return;
    }
    if (!manual.skillLevel) {
      toast.error("Pick the level that fits them best.");
      return;
    }
    start(async () => {
      const res = await addPlayerToPoolAction({
        competitionId,
        name: manual.name.trim(),
        email: manual.email.trim() || undefined,
        phone: manual.phone.trim() || undefined,
        positions: manual.positions,
        skillLevel: manual.skillLevel,
        notes: manual.notes.trim() || undefined,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`${manual.name.trim()} added to the pool.`);
      setManual({ ...BLANK });
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a player</DialogTitle>
          <DialogDescription>
            Search the people you already run — they keep the same name and
            email — or enter somebody new.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="flex gap-2">
            <Input
              value={term}
              placeholder="Email or name"
              aria-label="Search your players"
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  search();
                }
              }}
            />
            <Button
              variant="outline"
              onClick={search}
              disabled={searching || !term.trim()}
            >
              <Search className="size-4" />
              {searching ? "…" : "Search"}
            </Button>
          </div>

          {results !== null && results.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Nobody in your leagues matches that. Add them below.
            </p>
          )}

          {results !== null && results.length > 0 && (
            <ul className="divide-rule border-rule divide-y rounded-lg border">
              {results.map((p) => (
                <li
                  key={p.userId ?? p.freeAgentId ?? p.name}
                  className="flex flex-wrap items-center justify-between gap-2 p-3"
                >
                  <div className="min-w-[8rem] flex-1">
                    <p className="text-sm font-medium">{p.name}</p>
                    {p.email && (
                      <p className="text-muted-foreground text-xs">{p.email}</p>
                    )}
                    {p.seenIn.length > 0 && (
                      <p className="text-ink-3 text-xs">
                        {p.seenIn.join(" · ")}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => addFound(p)}
                  >
                    <UserPlus className="size-3.5" />
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {manual === null ? (
            <Button
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() => setManual({ ...BLANK })}
            >
              Can&rsquo;t find them? Add someone new
            </Button>
          ) : (
            <section className="border-rule grid gap-3 border-t pt-3">
              <h3 className="text-sm font-semibold">Someone new</h3>
              <SignupDetailsFields
                sport={sport}
                value={manual}
                onChange={setManual}
                disabled={pending}
              />
              <Button
                onClick={addManual}
                disabled={pending || !manual.name.trim()}
                className="justify-self-start"
              >
                {pending ? "Adding…" : "Add to pool"}
              </Button>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
