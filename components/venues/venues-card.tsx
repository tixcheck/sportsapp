"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { VenueSummary } from "@/lib/venues/resolve";
import { mapsUrl } from "@/lib/venues/resolve";
import {
  createVenueAction,
  deleteVenueAction,
  updateVenueAction,
} from "@/server/actions/venues";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Draft = {
  id?: string;
  name: string;
  address: string;
  entryNotes: string;
  doorsNote: string;
};

const EMPTY: Draft = { name: "", address: "", entryNotes: "", doorsNote: "" };

function VenueForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  pending,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="border-border bg-surface space-y-3 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="venue-name">Name</Label>
          <Input
            id="venue-name"
            value={draft.name}
            maxLength={80}
            placeholder="Terry Miller"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="venue-address">Address</Label>
          <Input
            id="venue-address"
            value={draft.address}
            maxLength={200}
            placeholder="1295 Williams Pkwy, Brampton"
            onChange={(e) => setDraft({ ...draft, address: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="venue-entry">Getting in</Label>
        <Input
          id="venue-entry"
          value={draft.entryNotes}
          maxLength={400}
          placeholder="Enter through the Rec Centre doors. Park in the south lot."
          onChange={(e) => setDraft({ ...draft, entryNotes: e.target.value })}
        />
        <p className="text-muted-foreground text-xs">
          Shown on the public schedule — don&apos;t put door codes here.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="venue-doors">Doors</Label>
        <Input
          id="venue-doors"
          value={draft.doorsNote}
          maxLength={120}
          placeholder="Doors open at 6:05pm and 8:05pm"
          onChange={(e) => setDraft({ ...draft, doorsNote: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={onSave}
          disabled={pending || !draft.name.trim()}
        >
          {pending ? "Saving…" : draft.id ? "Save changes" : "Add venue"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * The gyms an organization plays in.
 *
 * Lives on the ORG rather than a competition because the same buildings come
 * back season after season — the address and the "enter through the east doors"
 * note are worth typing once, not once per league.
 */
export function VenuesCard({
  orgId,
  venues,
}: {
  orgId: string;
  venues: VenueSummary[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, start] = useTransition();

  function save() {
    if (!draft) return;
    start(async () => {
      const payload = {
        orgId,
        name: draft.name.trim(),
        address: draft.address.trim() || undefined,
        entryNotes: draft.entryNotes.trim() || undefined,
        doorsNote: draft.doorsNote.trim() || undefined,
      };
      const res = draft.id
        ? await updateVenueAction({ ...payload, id: draft.id })
        : await createVenueAction(payload);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(draft.id ? "Venue updated." : "Venue added.");
      setDraft(null);
      router.refresh();
    });
  }

  function remove(v: VenueSummary) {
    start(async () => {
      const res = await deleteVenueAction(orgId, v.id);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.affectedMatches > 0
          ? `${v.name} removed. ${res.affectedMatches} games kept their times and now show the competition's venue.`
          : `${v.name} removed.`,
      );
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Venues</CardTitle>
          <CardDescription>
            The gyms and parks you play in. Add them once and assign courts to
            them on each league.
          </CardDescription>
        </div>
        {!draft && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDraft({ ...EMPTY })}
          >
            <Plus className="size-3.5" />
            Add venue
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {draft && (
          <VenueForm
            draft={draft}
            setDraft={setDraft}
            onSave={save}
            onCancel={() => setDraft(null)}
            pending={pending}
          />
        )}

        {venues.length === 0 && !draft ? (
          <div className="border-border rounded-lg border border-dashed px-4 py-8 text-center">
            <p className="text-sm font-medium">No venues yet</p>
            <p className="text-muted-foreground mt-1 text-xs">
              If everything you run is in one place, you don&apos;t need these —
              add them when a league spans more than one building.
            </p>
          </div>
        ) : (
          <ul className="divide-border divide-y">
            {venues.map((v) => {
              const maps = mapsUrl(v);
              return (
                <li
                  key={v.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{v.name}</p>
                    {v.address && (
                      <p className="text-muted-foreground text-xs">
                        {maps ? (
                          <a
                            href={maps}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 hover:underline"
                          >
                            <MapPin className="size-3" />
                            {v.address}
                          </a>
                        ) : (
                          v.address
                        )}
                      </p>
                    )}
                    {v.doorsNote && (
                      <p className="text-muted-foreground text-xs">
                        {v.doorsNote}
                      </p>
                    )}
                    {v.entryNotes && (
                      <p className="text-muted-foreground mt-0.5 text-xs italic">
                        {v.entryNotes}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit ${v.name}`}
                      disabled={pending}
                      onClick={() =>
                        setDraft({
                          id: v.id,
                          name: v.name,
                          address: v.address ?? "",
                          entryNotes: v.entryNotes ?? "",
                          doorsNote: v.doorsNote ?? "",
                        })
                      }
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${v.name}`}
                      disabled={pending}
                      onClick={() => remove(v)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
