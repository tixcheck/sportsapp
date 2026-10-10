import { noteLines } from "@/lib/competition/sheet-notes";
import type {
  RoundGame,
  RoundGym,
  RoundSchedule,
} from "@/lib/queries/round-schedule";

/**
 * BVL's round schedule on paper — the layout of the Round 1 mock they asked
 * for (2026-10-10). Pure presentation; the data is `getRoundSchedule`.
 */

function Game({ g }: { g: RoundGame }) {
  return (
    <>
      <b>{g.homeSeat}</b> {g.home}
      <br />
      <i>vs</i> <b>{g.awaySeat}</b> {g.away}
      {g.half && <span className="half">1 game · {g.half.serves} serves</span>}
    </>
  );
}

function Gym({ gym }: { gym: RoundGym }) {
  return (
    <div className="gym">
      <h3>{gym.name}</h3>
      {(gym.address || gym.directions) && (
        <p className="dir">
          {gym.address}
          {gym.address && gym.directions ? " · " : ""}
          {gym.directions}
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th />
            {gym.courts.map((c) => (
              <th key={c}>Court {c}</th>
            ))}
            {gym.hasOff && <th>Off</th>}
          </tr>
        </thead>
        <tbody>
          {gym.rows.map((r, i) => (
            <tr key={i}>
              <td className="t">{r.time}</td>
              <td className="tier" style={{ background: r.color }}>
                {r.tier.replace(/^Division\s+/, "Div ")}
              </td>
              {r.cells.map((c, j) =>
                c ? (
                  <td
                    key={j}
                    style={{ background: r.color }}
                    className={c.half ? "red" : undefined}
                  >
                    <Game g={c} />
                  </td>
                ) : (
                  <td key={j} />
                ),
              )}
              {gym.hasOff && <td className="off">{r.off.join(", ")}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {gym.nets.length > 0 && (
        <p className="nets">
          {gym.nets
            .map((n) => `${n.tier} nets: ${n.teams.join(", ")}`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

export function RoundSchedulePrint({ data }: { data: RoundSchedule }) {
  return (
    <div className="round-print">
      <h1>
        {data.league} — Round {data.round}
      </h1>
      <p className="sub">
        {data.span}. Numbers are each team&apos;s seat in its tier (1 = top).
        After the round, 2 teams move up and 2 down.
      </p>

      {(data.notes.length > 0 || data.hasHalves) && (
        <section className="notes">
          {data.notes.map((n, i) => (
            <div key={i} className="note">
              {n.title && <b>{n.title}</b>}
              {noteLines(n).map((l, j) => (
                <p key={j}>{l}</p>
              ))}
            </div>
          ))}
          {data.hasHalves && (
            <div className="note red-note">
              <b>Red games</b>
              <p>
                One game each week; the two together make the match. The higher
                seed serves first in week 1, the other team in week 2.
              </p>
            </div>
          )}
        </section>
      )}

      {data.roster && (
        <section className="roster-sec">
          <h2>
            Roster check — {data.roster.filter((r) => r.ready).length} of{" "}
            {data.roster.length} teams ready
          </h2>
          <table className="roster">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Team</th>
                <th>Joined</th>
                <th>Invited</th>
                <th>Waivers</th>
                <th>Paid</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.roster.map((r) => (
                <tr key={r.team} className={r.ready ? "" : "bad"}>
                  <td style={{ background: r.color }}>{r.tier}</td>
                  <td>{r.team}</td>
                  <td className="c">
                    {r.joined}
                    {r.minRoster != null ? `/${r.minRoster}` : ""}
                  </td>
                  <td className="c">{r.invited || ""}</td>
                  <td className="c">
                    {r.joined - r.unsigned}/{r.joined}
                  </td>
                  <td className="c">{r.paid ? "Paid" : "—"}</td>
                  <td>{r.ready ? "✓ Ready" : `⚠ ${r.needs.join("; ")}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data.nights.map((n) => (
        <section key={n.week} className="night">
          <h2>{n.label}</h2>
          <div className="grid">
            {n.gyms.map((g) => (
              <Gym key={g.name} gym={g} />
            ))}
          </div>
        </section>
      ))}

      <section className="tiers-sec">
        <h2>Tiers</h2>
        <div className="tls">
          {data.tiers.map((t) => (
            <div
              key={t.name}
              className="tl"
              style={{ borderTop: `5px solid ${t.color}` }}
            >
              <b>{t.name}</b> · {t.teams.length} teams
              <ol>
                {t.teams.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export const ROUND_PRINT_CSS = `
.round-print { font: 10.5px/1.3 Arial, Helvetica, sans-serif; color: #000; max-width: 7.9in; margin: 0 auto;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.round-print h1 { font-size: 19px; margin: 0 0 2px; }
.round-print h2 { font-size: 14px; margin: 12px 0 6px; border-bottom: 2px solid #000; padding-bottom: 2px; break-after: avoid; }
.round-print h3 { font-size: 12px; margin: 0 0 1px; }
.round-print p { margin: 0 0 4px; } .round-print .sub { color: #333; margin-bottom: 8px; }
.round-print .notes { border: 2px solid #c00000; padding: 6px 8px; margin-bottom: 6px; }
.round-print .note { margin-bottom: 4px; } .round-print .note b { color: #c00000; }
.round-print .red-note b { color: #c00000; }
.round-print .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.round-print .gym { break-inside: avoid; }
.round-print .dir { font-size: 9px; color: #444; }
.round-print table { border-collapse: collapse; width: 100%; }
.round-print th, .round-print td { border: 1px solid #333; padding: 3px 4px; vertical-align: top; }
.round-print th { background: #222; color: #fff; font-size: 9.5px; }
.round-print td.t { font-weight: 700; white-space: nowrap; width: 30px; }
.round-print td.tier { font-weight: 700; font-size: 9px; white-space: nowrap; width: 1%; }
.round-print td.off { font-size: 9px; color: #333; }
.round-print td.red { box-shadow: inset 0 0 0 2px #c00000; }
.round-print .half { display: block; color: #c00000; font-weight: 700; font-size: 8.5px; margin-top: 1px; }
.round-print i { color: #555; font-size: 9px; }
.round-print .nets { font-size: 9px; color: #333; margin-top: 2px; }
.round-print .roster td.c { text-align: center; white-space: nowrap; }
.round-print .roster tr.bad td { background: #fff3cd; }
.round-print .roster tr.bad td:first-child { background: inherit; }
.round-print .tls { display: flex; gap: 10px; break-inside: avoid; }
.round-print .tl { flex: 1; border: 1px solid #bbb; padding: 5px 7px; }
.round-print .tl ol { margin: 4px 0 0 18px; padding: 0; list-style: decimal; }
.round-print .tiers-sec { break-inside: avoid; }
@page { size: Letter portrait; margin: 9mm; }
@media print { html, body { background: #fff !important; } }
`;
