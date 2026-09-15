"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Search, Users } from "lucide-react";
import { toast } from "sonner";

import type {
  AnswerMap,
  PlayerDirectoryRow,
  RegistrationQuestion,
} from "@/lib/queries/registration-questions";
import { savePlayerAnswersAction } from "@/server/actions/registration-questions";
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
}: {
  competitionId: string;
  players: PlayerDirectoryRow[];
  /** Player-scope questions only — a team answer is not edited from here. */
  questions: RegistrationQuestion[];
  addressAutocomplete: boolean;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<PlayerDirectoryRow | null>(null);

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
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4" />
          Players
        </CardTitle>
        <CardDescription>
          Everyone on a roster, with what they answered at registration. Edit
          anything that needs correcting — a phone number, a spelling.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {players.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nobody is on a roster yet. Players appear here as teams fill up.
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
                        {p.teamName}
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
                        {/* Answers are keyed by account, so there is nothing
                            to edit for somebody drafted without one. Saying
                            so beats a button that opens an empty form. */}
                        {p.userId ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditing(p)}
                            aria-label={`Edit ${p.name}`}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            from the draft
                          </span>
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

      {editing && (
        <EditPlayerDialog
          key={editing.userId ?? editing.freeAgentId}
          competitionId={competitionId}
          player={editing}
          questions={questions}
          addressAutocomplete={addressAutocomplete}
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
  onClose,
}: {
  competitionId: string;
  player: PlayerDirectoryRow;
  questions: RegistrationQuestion[];
  addressAutocomplete: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [values, setValues] = useState<AnswerMap>(player.answers);
  const [meta, setMeta] = useState<Record<string, Record<string, unknown>>>({});

  function save() {
    start(async () => {
      if (!player.userId) return;
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
      toast.success(`Saved ${player.name}'s details.`);
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
            {player.teamName}
            {player.accountName && ` · signs in as ${player.accountName}`}
          </DialogDescription>
        </DialogHeader>

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
