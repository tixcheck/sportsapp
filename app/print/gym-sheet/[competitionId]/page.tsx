import Link from "next/link";
import { notFound } from "next/navigation";

import { getGymSheets } from "@/lib/queries/gym-sheets";
import { GYM_SHEET_CSS, GymSheetPage } from "@/components/print/gym-sheet";
import { PrintButton } from "@/components/schedule/print-button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Gym sheet — print" };

/**
 * The night's gym sheet, one tier at a time.
 *
 * SMVA (Alessandro, 2026-10-08): "only need to print 1 tier so they choose
 * tier then get the 1 page to print". Each gym's convenor picks their tier and
 * prints its single page; "All tiers" prints the whole package, one per page.
 */
export default async function GymSheetPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ competitionId: string }>;
  searchParams: Promise<{ week?: string; tier?: string }>;
}) {
  const { competitionId } = await params;
  const q = await searchParams;
  const requested = Number(q.week);
  const sheets = await getGymSheets(
    competitionId,
    Number.isInteger(requested) && requested > 0 ? requested : null,
  );
  if (!sheets) notFound();

  const base = `/print/gym-sheet/${competitionId}`;
  const href = (week: number, tier?: string) =>
    `${base}?week=${week}${tier ? `&tier=${tier}` : ""}`;
  const chosen =
    q.tier === "all"
      ? sheets.tiers
      : sheets.tiers.filter((t) => t.divisionId === q.tier);
  const printable = chosen.filter((t) => !t.problem);

  const chip = (active: boolean) =>
    cn(
      "rounded-md border px-3 py-1.5 text-sm",
      active
        ? "border-black bg-black text-white"
        : "border-neutral-300 bg-white hover:bg-neutral-100",
    );

  return (
    <main className="min-h-screen bg-white p-6 text-black print:p-0">
      <style>{GYM_SHEET_CSS}</style>

      <div className="mx-auto mb-6 max-w-3xl space-y-4 print:hidden">
        <div>
          <h1 className="text-xl font-bold">{sheets.league}</h1>
          <p className="text-sm text-neutral-600">
            Gym sheets · week {sheets.week}
            {sheets.night ? ` · ${sheets.night}` : ""}
          </p>
        </div>

        {sheets.weeks.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Week</span>
            {sheets.weeks.map((w) => (
              <Link
                key={w}
                href={href(w, q.tier)}
                className={chip(w === sheets.week)}
              >
                {w}
              </Link>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Choose your tier</p>
          <div className="flex flex-wrap gap-2">
            {sheets.tiers.map((t) => (
              <Link
                key={t.divisionId}
                href={href(sheets.week, t.divisionId)}
                className={chip(q.tier === t.divisionId)}
              >
                {t.name}
              </Link>
            ))}
            <Link
              href={href(sheets.week, "all")}
              className={chip(q.tier === "all")}
            >
              All tiers
            </Link>
          </div>
        </div>

        {printable.length > 0 && (
          <div className="flex items-center gap-3">
            <PrintButton />
            <span className="text-sm text-neutral-600">
              {printable.length === 1
                ? "One page."
                : `${printable.length} pages, one per tier.`}
            </span>
          </div>
        )}
        {chosen
          .filter((t) => t.problem)
          .map((t) => (
            <p key={t.divisionId} className="text-sm text-amber-700">
              {t.name}: {t.problem}
            </p>
          ))}
      </div>

      {printable.length > 0 && (
        <div className="gym-sheets">
          {printable.map((t) => (
            <GymSheetPage
              key={t.divisionId}
              tier={t}
              night={sheets.night}
              notes={sheets.notes}
            />
          ))}
        </div>
      )}
    </main>
  );
}
