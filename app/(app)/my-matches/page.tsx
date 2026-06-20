import {
  getMyMatches,
  getMyPlayoffProjections,
} from "@/lib/queries/my-matches";
import { MatchSections } from "@/components/scoring/match-sections";

export default async function MyMatchesPage() {
  const [matches, projections] = await Promise.all([
    getMyMatches(),
    getMyPlayoffProjections(),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
        My matches
      </h1>

      {matches.length === 0 && projections.length === 0 ? (
        <div className="border-border bg-surface text-muted-foreground rounded-lg border p-10 text-center text-sm">
          No matches yet. When you captain a team — or your team is assigned to
          ref — your matches show up here.
        </div>
      ) : (
        <MatchSections matches={matches} projections={projections} />
      )}
    </div>
  );
}
