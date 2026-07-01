"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";

import { removeKotcPairAction } from "@/server/actions/kotc";

/** The pair roster with a confirm-to-remove control on each chip (for no-shows). */
export function RosterList({
  competitionId,
  pairs,
}: {
  competitionId: string;
  pairs: { id: string; name: string; players?: string | null }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function remove(id: string, name: string) {
    start(async () => {
      const res = await removeKotcPairAction(competitionId, id);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`Removed ${name}.`);
      setConfirmId(null);
      router.refresh();
    });
  }

  if (pairs.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {pairs.map((p) => {
        const confirming = confirmId === p.id;
        return (
          <span
            key={p.id}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
              confirming
                ? "border-destructive/50 bg-destructive/5"
                : "border-border bg-surface"
            }`}
          >
            <span className="truncate">
              {p.name}
              {p.players && (
                <span className="text-muted-foreground"> · {p.players}</span>
              )}
            </span>
            {confirming ? (
              <>
                <button
                  type="button"
                  onClick={() => remove(p.id, p.name)}
                  disabled={pending}
                  className="text-destructive font-medium hover:underline"
                >
                  {pending ? "…" : "Remove"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmId(null)}
                  title="Cancel"
                  className="text-muted-foreground hover:text-foreground inline-flex"
                >
                  <X className="size-3.5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmId(p.id)}
                title={`Remove ${p.name}`}
                className="text-muted-foreground hover:text-destructive inline-flex"
              >
                <X className="size-3.5" />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
