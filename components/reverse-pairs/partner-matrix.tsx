import type { PartnerMatrix } from "@/lib/stats/reverse-pairs";
import type { ReversePairsPair } from "@/lib/queries/reverse-pairs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * How many times each pair has been teamed with each other pair.
 *
 * This is the grid the organizer keeps by hand — the one in his spreadsheet
 * with two of eighteen rows filled in. It is the check that the draw did its
 * job, so the two numbers that matter are readable without counting: a 0 means
 * they have never played together, a 2 or more means they have doubled up.
 *
 * Colour carries the reading and the number carries the detail, because a grid
 * of identical 1s is exactly what a good draw looks like and the eye should go
 * straight to the exceptions.
 */
export function PartnerMatrixCard({
  pairs,
  matrix,
}: {
  pairs: ReversePairsPair[];
  matrix: PartnerMatrix;
}) {
  const byId = new Map(pairs.map((p) => [p.id, p]));
  const order = matrix.teamIds;

  // Row labels are numbers, matching how the organizer writes his sheet: an
  // 18-wide grid of names is unreadable at any screen size.
  const label = new Map(order.map((id, i) => [id, i + 1]));

  if (order.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Who has played with whom</CardTitle>
        <CardDescription>
          Times each pair has been on the same team.{" "}
          {matrix.repeats.length === 0 ? (
            <span className="text-pine font-medium">
              No pair has been teamed twice.
            </span>
          ) : (
            <>
              <span className="font-medium">
                {matrix.repeats.length} pairing
                {matrix.repeats.length === 1 ? "" : "s"} repeated
              </span>
              , most often {matrix.max} times.
            </>
          )}{" "}
          {matrix.neverTogether.length > 0 && (
            <>
              {matrix.neverTogether.length} pairing
              {matrix.neverTogether.length === 1 ? "" : "s"} haven&rsquo;t
              happened.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-0 text-xs tabular-nums">
            <thead>
              <tr>
                <th className="bg-surface sticky left-0 z-10 p-1 text-left font-medium">
                  <span className="sr-only">Pair</span>
                </th>
                {order.map((id) => (
                  <th
                    key={id}
                    scope="col"
                    className="text-ink-3 w-7 p-1 text-center font-medium"
                    title={byId.get(id)?.name}
                  >
                    {label.get(id)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.map((rowId, i) => (
                <tr key={rowId}>
                  <th
                    scope="row"
                    className="bg-surface border-rule sticky left-0 z-10 max-w-[10rem] truncate border-r p-1 pr-2 text-left font-medium whitespace-nowrap"
                  >
                    <span className="text-ink-3 mr-1.5">
                      {label.get(rowId)}
                    </span>
                    {byId.get(rowId)?.name}
                  </th>
                  {order.map((colId, j) => {
                    const n = matrix.counts[i][j];
                    const self = i === j;
                    return (
                      <td
                        key={colId}
                        className={cn(
                          "border-rule/50 h-7 w-7 border text-center",
                          self && "bg-paper-sunken",
                          !self && n === 0 && "bg-claret-tint text-claret",
                          !self && n === 1 && "text-ink-3",
                          !self &&
                            n > 1 &&
                            "bg-pine/15 text-pine font-semibold",
                        )}
                        title={
                          self
                            ? undefined
                            : `${byId.get(rowId)?.name} + ${byId.get(colId)?.name}: ${n}`
                        }
                      >
                        {self ? "" : n}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-ink-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="bg-claret-tint border-rule inline-block size-3 rounded-[2px] border" />
            never together
          </span>
          <span className="flex items-center gap-1.5">
            <span className="border-rule inline-block size-3 rounded-[2px] border" />
            once
          </span>
          <span className="flex items-center gap-1.5">
            <span className="bg-pine/15 border-rule inline-block size-3 rounded-[2px] border" />
            twice or more
          </span>
        </p>

        {matrix.repeats.length > 0 && (
          <div className="text-ink-2 text-xs">
            <p className="mb-1 font-medium">Repeated pairings</p>
            <p>
              {matrix.repeats
                .slice(0, 12)
                .map(
                  (r) =>
                    `${byId.get(r.a)?.name} + ${byId.get(r.b)?.name} (${r.times}×)`,
                )
                .join(" · ")}
              {matrix.repeats.length > 12 &&
                ` · and ${matrix.repeats.length - 12} more`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
