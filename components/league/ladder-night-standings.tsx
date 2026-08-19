import { DateTime } from "luxon";

import type { LadderNight } from "@/lib/queries/ladder-standings";
import type { MatchFormat } from "@/lib/db/schema";
import type { Sport } from "@/lib/formats";
import { StandingsTable } from "@/components/standings/standings-table";

/**
 * A ladder's standings, one table per night.
 *
 * Deliberately not a season table. Teams change tiers every week, so they never
 * share a schedule — and the night is what actually decides who goes up and who
 * comes down. Each night is grouped by the tiers as they stood THAT week, so a
 * promoted team still appears in the tier it played in.
 */
export function LadderNightStandings({
  nights,
  timezone,
  format,
  sport,
  differential = false,
}: {
  nights: LadderNight[];
  timezone: string;
  format?: MatchFormat;
  sport?: Sport;
  differential?: boolean;
}) {
  if (nights.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        Standings appear once the first night has been drawn and played.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-muted-foreground text-sm">
        One table per night — the night is what decides who moves up and down.
        Tiers are shown as they stood that week, so a team that has since moved
        still appears where it played.
      </p>

      {nights.map((night) => (
        <section key={night.week} className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="font-display text-lg font-semibold">
              Week {night.week}
            </h3>
            {night.date && (
              <span className="text-muted-foreground text-sm">
                {DateTime.fromISO(night.date, { zone: timezone }).toFormat(
                  "cccc, LLL d",
                )}
              </span>
            )}
            {!night.complete && (
              <span className="bg-paper-sunken text-ink-2 rounded-[4px] px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                In progress
              </span>
            )}
          </div>

          {night.tiers.map((tier) => (
            <div key={tier.divisionId} className="space-y-2">
              <h4 className="font-display text-sm font-semibold">
                {tier.divisionName}
              </h4>
              <StandingsTable
                rows={tier.rows}
                format={format}
                sport={sport}
                differential={differential}
              />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
