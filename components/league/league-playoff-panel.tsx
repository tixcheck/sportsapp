"use client";

import { useState } from "react";

import type { StandingsGroup } from "@/lib/standings/compute";
import type { FormatTemplate } from "@/lib/tournament-formats";
import { GenerateBracketPanel } from "@/components/tournament/generate-bracket-panel";
import { cn } from "@/lib/utils";

/**
 * League playoffs: seed a bracket from the final league standings. Wraps the
 * shared GenerateBracketPanel, adding a single-vs-championship/consolation
 * choice (leagues don't store a bracket template the way tournaments do).
 */
export function LeaguePlayoffPanel({
  competitionId,
  standings,
  hasBracket,
  seasonComplete,
}: {
  competitionId: string;
  standings: StandingsGroup[];
  hasBracket: boolean;
  seasonComplete: boolean;
}) {
  const [template, setTemplate] = useState<FormatTemplate>("single");

  return (
    <div className="space-y-4">
      {!hasBracket && (
        <div className="border-border flex w-fit rounded-md border p-0.5 text-xs">
          {(
            [
              ["single", "Single bracket"],
              ["champ_consolation", "Championship + Consolation"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTemplate(value)}
              className={cn(
                "rounded px-2.5 py-1",
                template === value
                  ? "bg-accent font-medium"
                  : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <GenerateBracketPanel
        competitionId={competitionId}
        pools={standings}
        hasBracket={hasBracket}
        poolPlayComplete={seasonComplete}
        formatTemplate={template}
        dropsComplete={true}
        phaseLabel="The season"
      />
    </div>
  );
}
