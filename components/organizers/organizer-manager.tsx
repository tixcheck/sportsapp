"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";

import type { OrganizerRow } from "@/lib/queries/organizers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ActionResult = { error: string } | { ok: true };

/**
 * Add-by-email + revoke list for organizers, shared by the org card and the
 * per-competition section. The add/remove server actions come in pre-bound to
 * their scope (org id / competition id). Rendered only where the viewer is the
 * owner/admin — gating mirrors the RLS, never the only line of defense.
 */
export function OrganizerManager({
  rows,
  addAction,
  removeAction,
  emptyText = "No organizers yet.",
}: {
  rows: OrganizerRow[];
  addAction: (email: string) => Promise<ActionResult>;
  removeAction: (userId: string) => Promise<ActionResult>;
  emptyText?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    start(async () => {
      const res = await addAction(value);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setEmail("");
      toast.success("Organizer added.");
      router.refresh();
    });
  }

  function remove(userId: string) {
    start(async () => {
      const res = await removeAction(userId);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Organizer removed.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <Input
          type="email"
          placeholder="helper@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="max-w-xs flex-1"
          aria-label="Organizer email"
        />
        <Button type="submit" disabled={pending}>
          Add
        </Button>
      </form>

      {rows.length === 0 ? (
        <p className="text-ink-2 text-sm">{emptyText}</p>
      ) : (
        <ul className="divide-rule divide-y">
          {rows.map((r) => {
            // Owner/admin are shown read-only; organizers + per-competition
            // grants (no role) are revocable.
            const removable = !r.role || r.role === "organizer";
            return (
              <li
                key={r.userId}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.name ?? r.email}</p>
                  <p className="text-ink-2 truncate text-xs">{r.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {r.role && r.role !== "organizer" && (
                    <span className="bg-paper-sunken text-ink-2 rounded-[4px] px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                      {r.role}
                    </span>
                  )}
                  {removable && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending}
                      onClick={() => remove(r.userId)}
                      aria-label={`Remove ${r.email}`}
                    >
                      <X />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
