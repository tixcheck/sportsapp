import { getMyMatches } from "@/lib/queries/my-matches";
import { MyMatchCard } from "@/components/scoring/my-match-card";

export default async function MyMatchesPage() {
  const matches = await getMyMatches();
  const upNext = matches.find((m) => m.state !== "final");
  const rest = matches.filter((m) => m.id !== upNext?.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
        My matches
      </h1>

      {matches.length === 0 ? (
        <div className="border-border bg-surface text-muted-foreground rounded-lg border p-10 text-center text-sm">
          No matches yet. When you captain a team — or your team is assigned to
          ref — your matches show up here.
        </div>
      ) : (
        <>
          {upNext && (
            <section className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Up next
              </p>
              <MyMatchCard match={upNext} />
            </section>
          )}
          {rest.length > 0 && (
            <section className="space-y-3">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                All matches
              </p>
              <div className="space-y-3">
                {rest.map((m) => (
                  <MyMatchCard key={m.id} match={m} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
