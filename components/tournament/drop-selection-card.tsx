"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { setTeamDropAction } from "@/server/actions/drops";
import type { DropTeamView } from "@/lib/queries/drops";

/**
 * Seed-time drop picker: each team in a needs_drop pool chooses one of its own
 * pool games to exclude from its standings. Bracket generation stays blocked
 * until every team has chosen (enforced again server-side).
 */
export function DropSelectionCard({ teams }: { teams: DropTeamView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function choose(teamId: string, matchId: string) {
    if (!matchId) return;
    start(async () => {
      const res = await setTeamDropAction(teamId, matchId);
      if ("error" in res) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="divide-rule divide-y">
      {teams.map((t) => (
        <div
          key={t.teamId}
          className="flex flex-wrap items-center justify-between gap-3 py-3"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">{t.teamName}</p>
            <p className="text-ink-2 text-xs">
              {t.poolName}
              {!t.droppedMatchId && (
                <span className="text-claret"> · needs a drop</span>
              )}
            </p>
          </div>
          <select
            disabled={pending}
            value={t.droppedMatchId ?? ""}
            onChange={(e) => choose(t.teamId, e.target.value)}
            aria-label={`Game ${t.teamName} drops`}
            className="border-rule bg-paper-raised focus-visible:ring-ring h-9 rounded-md border px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            <option value="" disabled>
              Pick a game to drop…
            </option>
            {t.games.map((g) => (
              <option key={g.matchId} value={g.matchId}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
