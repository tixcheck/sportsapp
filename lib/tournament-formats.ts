/**
 * Tournament structure templates (v1). The organizer picks one at creation; it
 * drives the seed step. Parallels FORMAT_PRESETS (match formats) — the chosen id
 * is stored on tournament_settings.format_template, the details live here.
 */

export type FormatTemplate = "single" | "champ_consolation" | "custom";

export interface TournamentFormat {
  id: FormatTemplate;
  label: string;
  description: string;
  /** Default bracket split for the seed step; null = a single bracket. */
  split: { championship: number; consolation: number } | null;
}

export const TOURNAMENT_FORMATS: TournamentFormat[] = [
  {
    id: "single",
    label: "Pools → Single bracket",
    description:
      "Pool play, then one single-elimination bracket of the top seeds.",
    split: null,
  },
  {
    id: "champ_consolation",
    label: "Pools → Championship + Consolation",
    description:
      "Pool play ranks everyone; the top seeds play a Championship bracket and the next a Consolation bracket.",
    split: { championship: 8, consolation: 7 },
  },
  {
    id: "custom",
    label: "Custom",
    description: "Set pools and the bracket up step by step yourself.",
    split: null,
  },
];

export function tournamentFormat(id: FormatTemplate): TournamentFormat {
  return TOURNAMENT_FORMATS.find((f) => f.id === id) ?? TOURNAMENT_FORMATS[0];
}
