/**
 * Per-sport match-format presets (PRD §6). The first preset for each sport is
 * the default. Stored on a competition as the `match_format` JSONB.
 */
import type { MatchFormat } from "@/lib/db/schema";

export type Sport = "indoor6" | "beach2" | "coed4";

export interface FormatPreset {
  id: string;
  label: string;
  format: MatchFormat;
}

export const SPORTS: { value: Sport; label: string; roster: string }[] = [
  { value: "indoor6", label: "Indoor 6s", roster: "6 on court, up to 12" },
  { value: "beach2", label: "Beach 2s", roster: "2 players, no subs" },
  { value: "coed4", label: "Co-ed 4s", roster: "4 on court (2M/2W)" },
];

export const FORMAT_PRESETS: Record<Sport, FormatPreset[]> = {
  indoor6: [
    {
      id: "indoor6-bo5",
      label: "Best of 5 (to 25, 5th set to 15)",
      format: { bestOf: 5, setsToPoints: [25, 25, 25, 25, 15], winBy: 2 },
    },
    {
      id: "indoor6-bo3",
      label: "Best of 3 to 25 (recreational)",
      format: { bestOf: 3, setsToPoints: [25, 25, 25], winBy: 2 },
    },
    {
      id: "indoor6-cap60",
      label: "2 sets to 25 + 1 to 15, capped 60'",
      format: {
        bestOf: 3,
        setsToPoints: [25, 25, 15],
        winBy: 2,
        capMinutes: 60,
      },
    },
  ],
  beach2: [
    {
      id: "beach2-bo3",
      label: "Best of 3 (to 21, 3rd set to 15)",
      format: { bestOf: 3, setsToPoints: [21, 21, 15], winBy: 2 },
    },
    {
      id: "beach2-pool",
      label: "2 sets to 21 + tiebreak to 11, capped 45'",
      format: {
        bestOf: 3,
        setsToPoints: [21, 21, 11],
        winBy: 2,
        capMinutes: 45,
        tiebreakerSetTo: 11,
      },
    },
    {
      id: "beach2-single",
      label: "Single set to 25 (quick play)",
      format: { bestOf: 1, setsToPoints: [25], winBy: 2 },
    },
  ],
  coed4: [
    {
      id: "coed4-bo3",
      label: "Best of 3 to 21",
      format: { bestOf: 3, setsToPoints: [21, 21, 21], winBy: 2 },
    },
    {
      id: "coed4-cap50",
      label: "2 sets to 21 + 1 to 15, capped 50'",
      format: {
        bestOf: 3,
        setsToPoints: [21, 21, 15],
        winBy: 2,
        capMinutes: 50,
      },
    },
  ],
};

/** Players on court per sport — the expected roster-email count at registration. */
export const ROSTER_SIZE: Record<Sport, number> = {
  indoor6: 6,
  beach2: 2,
  coed4: 4,
};

export function defaultPreset(sport: Sport): FormatPreset {
  return FORMAT_PRESETS[sport][0];
}

/** Tournament pool default — the pool variant where one exists, else the default. */
export function defaultPoolPreset(sport: Sport): FormatPreset {
  const presets = FORMAT_PRESETS[sport];
  return presets.find((p) => p.id.includes("pool")) ?? presets[0];
}

export function findPreset(sport: Sport, id: string): FormatPreset {
  return FORMAT_PRESETS[sport].find((p) => p.id === id) ?? defaultPreset(sport);
}
