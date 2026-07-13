import { notFound } from "next/navigation";
import { DateTime } from "luxon";

import {
  getPrintSchedule,
  type PrintMatch,
} from "@/lib/queries/print-schedule";
import { PrintButton } from "@/components/schedule/print-button";

export const metadata = { title: "Schedule — print" };

/** Trailing court number for a stable "Court 2 < Court 10" sort; TBD last. */
function courtNum(court: string | null): number {
  const m = court?.match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
}

export default async function PrintSchedulePage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const { competitionId } = await params;
  const sched = await getPrintSchedule(competitionId);
  if (!sched) notFound();

  const tz = sched.timezone;
  const fmtTime = (iso: string) =>
    DateTime.fromISO(iso, { zone: tz }).toFormat("h:mm a");

  // Group by day (venue tz); unscheduled games sort to the end.
  const groups = new Map<string, { label: string; matches: PrintMatch[] }>();
  for (const m of sched.matches) {
    const dt = m.scheduledAt
      ? DateTime.fromISO(m.scheduledAt, { zone: tz })
      : null;
    const key = dt ? dt.toFormat("yyyy-MM-dd") : "zzzz-unscheduled";
    const label = dt ? dt.toFormat("cccc, LLLL d, yyyy") : "Unscheduled";
    if (!groups.has(key)) groups.set(key, { label, matches: [] });
    groups.get(key)!.matches.push(m);
  }
  const ordered = [...groups.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  for (const [, g] of ordered) {
    g.matches.sort(
      (a, b) =>
        (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? "") ||
        courtNum(a.court) - courtNum(b.court) ||
        (a.round ?? 0) - (b.round ?? 0),
    );
  }
  const showPool = sched.matches.some((m) => m.poolName || m.divisionName);
  const generated = DateTime.now().setZone(tz).toFormat("LLL d, yyyy · h:mm a");

  return (
    <main className="mx-auto min-h-screen max-w-4xl bg-white p-6 text-black print:p-0">
      <div className="mb-5 flex items-center justify-end gap-3 print:hidden">
        <PrintButton />
      </div>

      <header className="mb-5 border-b-2 border-black pb-3">
        <h1 className="text-2xl font-bold">{sched.name}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Schedule
          {sched.venue ? ` · ${sched.venue}` : ""} · generated {generated}
        </p>
      </header>

      {sched.matches.length === 0 ? (
        <p className="text-sm text-neutral-600">No matches scheduled yet.</p>
      ) : (
        ordered.map(([key, g]) => (
          <section key={key} className="mb-6 break-inside-avoid">
            <h2 className="mb-2 text-base font-semibold">{g.label}</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-black text-left">
                  <th className="py-1 pr-3 font-semibold">Time</th>
                  <th className="py-1 pr-3 font-semibold">Court</th>
                  {showPool && (
                    <th className="py-1 pr-3 font-semibold">Pool</th>
                  )}
                  <th className="py-1 pr-3 font-semibold">Home</th>
                  <th className="py-1 pr-3 font-semibold">Away</th>
                  <th className="py-1 font-semibold">Ref</th>
                </tr>
              </thead>
              <tbody>
                {g.matches.map((m, i) => (
                  <tr key={i} className="border-b border-neutral-300 align-top">
                    <td className="py-1 pr-3 whitespace-nowrap tabular-nums">
                      {m.scheduledAt ? fmtTime(m.scheduledAt) : "—"}
                    </td>
                    <td className="py-1 pr-3 whitespace-nowrap">
                      {m.court ?? "—"}
                    </td>
                    {showPool && (
                      <td className="py-1 pr-3 whitespace-nowrap">
                        {m.divisionName
                          ? `${m.divisionName}${m.poolName ? ` · ${m.poolName}` : ""}`
                          : m.bracketPosition != null
                            ? "Playoffs"
                            : (m.poolName ?? "—")}
                      </td>
                    )}
                    <td className="py-1 pr-3">{m.homeName}</td>
                    <td className="py-1 pr-3">{m.awayName}</td>
                    <td className="py-1">{m.refName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </main>
  );
}
