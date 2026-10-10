import Link from "next/link";
import { notFound } from "next/navigation";

import { getRoundSchedule } from "@/lib/queries/round-schedule";
import {
  ROUND_PRINT_CSS,
  RoundSchedulePrint,
} from "@/components/print/round-schedule";
import { PrintButton } from "@/components/schedule/print-button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Round schedule — print" };

/**
 * A BVL round, printed the way their mock looked (2026-10-10). Pick the round;
 * the roster check is an organizer's option, on by default for them.
 */
export default async function RoundSchedulePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ competitionId: string }>;
  searchParams: Promise<{ round?: string; roster?: string }>;
}) {
  const { competitionId } = await params;
  const q = await searchParams;
  const requested = Number(q.round);
  const withRoster = q.roster !== "0";
  const data = await getRoundSchedule(competitionId, {
    round: Number.isInteger(requested) && requested > 0 ? requested : null,
    roster: withRoster,
  });
  if (!data) notFound();

  const href = (round: number, roster: boolean) =>
    `/print/round-schedule/${competitionId}?round=${round}${roster ? "" : "&roster=0"}`;
  const chip = (active: boolean) =>
    cn(
      "rounded-md border px-3 py-1.5 text-sm",
      active
        ? "border-black bg-black text-white"
        : "border-neutral-300 bg-white hover:bg-neutral-100",
    );

  return (
    <main className="min-h-screen bg-white p-6 text-black print:p-0">
      <style>{ROUND_PRINT_CSS}</style>
      <div className="mx-auto mb-6 max-w-3xl space-y-3 print:hidden">
        {data.rounds.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Round</span>
            {data.rounds.map((r) => (
              <Link
                key={r}
                href={href(r, withRoster)}
                className={chip(r === data.round)}
              >
                {r}
              </Link>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <PrintButton />
          <Link href={href(data.round, !withRoster)} className={chip(false)}>
            {withRoster ? "Hide roster check" : "Show roster check"}
          </Link>
        </div>
      </div>
      {data.nights.length === 0 ? (
        <p className="mx-auto max-w-3xl text-sm text-neutral-600">
          Round {data.round} hasn&apos;t been drawn yet.
        </p>
      ) : (
        <RoundSchedulePrint data={data} />
      )}
    </main>
  );
}
