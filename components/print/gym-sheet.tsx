import { noteLines, type SheetNote } from "@/lib/competition/sheet-notes";
import type { TierSheet } from "@/lib/queries/gym-sheets";

/**
 * SMVA's gym sheet, one tier per page — THEIR sheet, as printed on Mon 28 Sep
 * 2026 (Leacock). The organizer, 2026-10-04: the print-out should be "exactly
 * how this sheet is", so the gym sees no change. Same markup and CSS as
 * `lib/db/sheet-smva-package.ts`, which produced the page they approved:
 * night and gym, the four coloured instruction blocks, the letter schedule
 * with movement and setup beside it, the A–F cross-table, then three officials
 * with signature lines. Letters, not names, in the schedule — the cross-table
 * is the legend.
 */

const LETTERS = "ABCDEFG";

/** Their colours, block by block, in the order SMVA_SHEET_NOTES lists them. */
const NOTE_STYLE = [
  { head: "orange", body: "orange" },
  { head: "navy", body: "black" },
  { head: "red", body: "red" },
  { head: "red", body: "black" },
];

const letterText = (s: string) => s.replace(/\{([A-G])\}/g, "$1");

function Notes({ notes }: { notes: SheetNote[] }) {
  return (
    <section className="notes">
      {notes.map((note, i) => {
        const style = NOTE_STYLE[i] ?? { head: "navy", body: "black" };
        return (
          <div className="note" key={i}>
            <h3 className={style.head}>{letterText(note.title)}</h3>
            <div className={`lines ${style.body}`}>
              {noteLines(note).map((l, j) => (
                <p key={j}>{letterText(l)}</p>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Schedule({ tier }: { tier: TierSheet }) {
  const letterOf = new Map(tier.teams.map((t, i) => [t.name, LETTERS[i]]));
  const anySitting = tier.slots.some((s) => s.sitting);
  const cols = tier.courtLabels.length + 2 + (anySitting ? 1 : 0);
  return (
    <table className="sched">
      <tbody>
        <tr>
          <th colSpan={cols} className="title">
            {tier.title}
          </th>
        </tr>
        <tr>
          <th className="t">Time</th>
          <th />
          {tier.courtLabels.map((c) => (
            <th key={c}>{c}</th>
          ))}
          {anySitting && <th>Sits</th>}
        </tr>
        {tier.slots.map((slot, i) => (
          <tr key={i}>
            <td className="t">{slot.time}</td>
            <td />
            {tier.courtLabels.map((label) => {
              const f = slot.fixtures.find((x) => x.court === label);
              return (
                <td key={label}>
                  {f
                    ? `${letterOf.get(f.home)} VS ${letterOf.get(f.away)}`
                    : ""}
                </td>
              );
            })}
            {anySitting && (
              <td>{slot.sitting ? letterOf.get(slot.sitting) : ""}</td>
            )}
          </tr>
        ))}
        <tr>
          <th colSpan={cols}>{tier.clock}</th>
        </tr>
        {tier.scoring && (
          <tr>
            <th colSpan={cols}>{tier.scoring}</th>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function Cross() {
  return (
    <td className="x">
      <svg viewBox="0 0 10 10" preserveAspectRatio="none" aria-hidden>
        <line x1="0" y1="0" x2="10" y2="10" />
        <line x1="10" y1="0" x2="0" y2="10" />
      </svg>
    </td>
  );
}

function CrossTable({ tier }: { tier: TierSheet }) {
  const letters = LETTERS.slice(0, tier.teams.length).split("");
  return (
    <table className="cross">
      <tbody>
        <tr className="h1">
          <th rowSpan={2} className="l" />
          <th rowSpan={2} className="team">
            Team
          </th>
          {letters.map((l) => (
            <th key={l} rowSpan={2} className="sq">
              {l}
            </th>
          ))}
          <th rowSpan={2} className="run">
            Running Totals
          </th>
          <th colSpan={2} className="eon">
            End of Night Results
          </th>
          <th rowSpan={2} className="nw">
            Do not write in this column
          </th>
          <th rowSpan={2} className="arrow" />
        </tr>
        <tr className="h2">
          <th className="pts">Total Points</th>
          <th className="pts">1st, 2nd, etc</th>
        </tr>
        {tier.teams.map((t, r) => (
          <tr key={t.id}>
            <td className="l">{LETTERS[r]}</td>
            <td className="team">{t.name}</td>
            {letters.map((_, c) =>
              c === r ? <Cross key={c} /> : <td key={c} className="sq" />,
            )}
            <td className="run" />
            <td className="pts" />
            <td className="pts" />
            <td className="nw" />
            <td className="arrow" />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Officials({ names }: { names: string[] }) {
  return (
    <section className="officials">
      {[0, 1, 2].map((i) => (
        <div className="off" key={i}>
          <span className="num">#{i + 1}</span>
          <span className="name">{names[i] ?? ""}</span>
          <span className="sign" />
        </div>
      ))}
    </section>
  );
}

export function GymSheetPage({
  tier,
  night,
  notes,
}: {
  tier: TierSheet;
  night: string;
  notes: SheetNote[];
}) {
  return (
    <article className="sheet">
      <h1>{night}</h1>
      <h2>{tier.gym}</h2>
      <Notes notes={notes} />
      <div className="sched-row">
        <Schedule tier={tier} />
        <div className="aside">
          {tier.movement && <p>{tier.movement}</p>}
          {tier.setupLetters && <p>{tier.setupLetters} setup courts</p>}
        </div>
      </div>
      <CrossTable tier={tier} />
      <Officials names={tier.officials} />
    </article>
  );
}

/** Scoped under `.gym-sheets` so the app's own styles are left alone. */
export const GYM_SHEET_CSS = `
.gym-sheets { color: #000; background: #fff;
  font: 10.5px/1.25 Arial, Helvetica, sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.gym-sheets * { box-sizing: border-box; }
@page { size: Letter portrait; margin: 9mm 10mm; }
.gym-sheets .sheet { page-break-after: always; max-width: 8in; margin: 0 auto; }
.gym-sheets .sheet:last-child { page-break-after: auto; }
@media screen { .gym-sheets .sheet { border: 1px solid #ddd; padding: 0.35in; margin-bottom: 24px; } }

.gym-sheets h1, .gym-sheets h2 { margin: 0; text-align: center; font-size: 17px; font-weight: 700; }
.gym-sheets h2 { margin-bottom: 8px; }

.gym-sheets .notes { margin: 0 0 10px; }
.gym-sheets .note h3 { margin: 2px 0 1px; font-size: 11px; font-weight: 700; text-decoration: underline; }
.gym-sheets .note .lines { margin-left: 1.55in; font-size: 11px; font-weight: 700; }
.gym-sheets .note .lines p { margin: 0 0 1px; }
.gym-sheets .orange { color: #d9541e; }
.gym-sheets .navy { color: #1f3864; }
.gym-sheets .red { color: #c00000; }
.gym-sheets .black { color: #000; }

.gym-sheets .sched-row { display: flex; gap: 22px; align-items: flex-start; margin: 0 0 6px 0.32in; }
.gym-sheets .sched { border-collapse: collapse; width: 4.95in; font-size: 12px; }
.gym-sheets .sched th, .gym-sheets .sched td { border: 1.3px solid #000; padding: 1px 4px; text-align: left; white-space: nowrap; }
.gym-sheets .sched th { font-weight: 700; text-align: center; }
.gym-sheets .sched th.title, .gym-sheets .sched th.t, .gym-sheets .sched td.t { text-align: left; }
.gym-sheets .sched tr:nth-child(2) th { text-align: left; }
.gym-sheets .sched td { font-weight: 700; }
.gym-sheets .sched td:nth-child(2), .gym-sheets .sched th:nth-child(2) { width: 0.62in; }
.gym-sheets .aside p { margin: 0 0 18px; font-size: 13px; }

.gym-sheets .cross { border-collapse: collapse; width: 100%; margin-top: 4px; }
.gym-sheets .cross th, .gym-sheets .cross td { border: 1.5px solid #000; text-align: center; padding: 0; }
.gym-sheets .cross th { font-size: 10.5px; font-weight: 400; }
.gym-sheets .cross tr.h1 th, .gym-sheets .cross tr.h2 th { height: 0.3in; }
.gym-sheets .cross td { height: 0.47in; font-size: 11.5px; }
.gym-sheets .cross .l { width: 0.5in; }
.gym-sheets .cross .team { width: 1.35in; }
.gym-sheets .cross td.team { font-size: 10.5px; padding: 0 3px; }
.gym-sheets .cross .sq { width: 0.5in; }
.gym-sheets .cross .run { width: 1.85in; }
.gym-sheets .cross .eon { font-size: 9px; }
.gym-sheets .cross .pts { width: 0.62in; font-size: 9.5px; }
.gym-sheets .cross .nw { width: 0.52in; font-size: 8.5px; line-height: 1.05; }
.gym-sheets .cross td.nw { background: #a6a6a6; }
.gym-sheets .cross .arrow { width: 0.5in; }
.gym-sheets .cross td.x { position: relative; }
.gym-sheets .cross td.x svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.gym-sheets .cross td.x line { stroke: #000; stroke-width: 1.6; vector-effect: non-scaling-stroke; }

.gym-sheets .officials { margin-top: 14px; width: 100%; }
.gym-sheets .off { display: flex; align-items: flex-end; gap: 8px; margin-bottom: 8px; }
.gym-sheets .off .num { width: 0.3in; font-size: 13px; font-weight: 700; text-align: right; }
.gym-sheets .off .name { width: 3.05in; height: 0.27in; border: 1.3px solid #000; padding: 2px 4px; font-size: 12px; }
.gym-sheets .off .sign { flex: 1; margin-left: 0.9in; border-bottom: 1.3px solid #000; height: 0.27in; }
`;
