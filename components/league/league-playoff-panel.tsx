"use client";

import { useState } from "react";

import type { StandingsGroup } from "@/lib/standings/compute";
import type { FormatTemplate } from "@/lib/tournament-formats";
import { GenerateBracketPanel } from "@/components/tournament/generate-bracket-panel";
import { FORMAT_PRESETS, type Sport } from "@/lib/formats";
import { cn } from "@/lib/utils";

/** A best-of-3 preset for the sport (for the playoff default), else the first. */
function bestOf3Default(sport: Sport): string {
  const presets = FORMAT_PRESETS[sport];
  return (presets.find((p) => p.format.bestOf === 3) ?? presets[0]).id;
}

/**
 * League playoffs: seed a bracket from the final league standings. Wraps the
 * shared GenerateBracketPanel, adding a single-vs-championship/consolation
 * choice (leagues don't store a bracket template the way tournaments do).
 */
export function LeaguePlayoffPanel({
  competitionId,
  sport,
  standings,
  hasBracket,
  seasonComplete,
  courts,
}: {
  competitionId: string;
  sport: Sport;
  standings: StandingsGroup[];
  hasBracket: boolean;
  seasonComplete: boolean;
  courts?: number;
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
        playoffFormat={{ sport, default: bestOf3Default(sport) }}
        courts={courts}
      />
    </div>
  );
}
