import Link from "next/link";

import type { AdminCompetition } from "@/lib/queries/admin";
import { PlatformFeeToggle } from "@/components/admin/platform-fee-toggle";

const SEGMENT: Record<string, string> = {
  league: "leagues",
  tournament: "tournaments",
  kotc: "kotc",
  reverse_pairs: "reverse-pairs",
};

const TYPE_LABEL: Record<string, string> = {
  league: "League",
  tournament: "Tournament",
  kotc: "KotC",
  reverse_pairs: "Reverse Pairs",
};

/** One competition on the platform overview: link, fee switch, status. */
export function AdminCompetitionRow({
  orgId,
  c,
}: {
  orgId: string;
  c: AdminCompetition;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <Link
          href={`/orgs/${orgId}/${SEGMENT[c.type]}/${c.id}`}
          className="font-medium hover:underline"
        >
          {c.name}
        </Link>
        <span className="text-muted-foreground ml-2 text-xs">
          {TYPE_LABEL[c.type] ?? c.type} · {c.sport} · {c.teamCount} team
          {c.teamCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <PlatformFeeToggle competitionId={c.id} waived={c.platformFeeWaived} />
        {c.visibility !== "public" && (
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
            {c.visibility}
          </span>
        )}
        <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-medium capitalize">
          {c.status}
        </span>
      </div>
    </li>
  );
}
