import Link from "next/link";
import { CircleAlert, CircleCheck } from "lucide-react";

import type { ManagedTeam } from "@/lib/queries/manage-teams";
import { CaptainRoster } from "@/components/team/captain-roster";
import { InviteTeammateDialog } from "@/components/team/invite-teammate-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * "Manage my teams" on the dashboard (2026-10-24): for each team the viewer
 * captains, what's still owed, "Add a player", and the roster with "Remove".
 * Captains asked Help how to do exactly these three things more than anything
 * else, and the answers lived one page deeper, on the team page.
 */
export function ManageTeams({ teams }: { teams: ManagedTeam[] }) {
  if (teams.length === 0) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold">Manage my teams</h2>
        <p className="text-muted-foreground text-sm">
          Add or remove players, and see what&apos;s left to do.
        </p>
      </div>
      {teams.length === 1 ? (
        <div className="max-w-2xl">
          <ManagedTeamCard team={teams[0]} />
        </div>
      ) : (
        // A tab per team, so a captain of two or three teams switches instead
        // of scrolling past whole rosters. Opens on the first team with
        // something to do.
        <Tabs
          defaultValue={
            (teams.find((t) => t.todos.length > 0) ?? teams[0]).teamId
          }
          className="max-w-2xl"
        >
          {/* Many teams scroll sideways inside the strip, not the page. */}
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <TabsList className="h-auto w-max">
              {teams.map((t) => (
                <TabsTrigger
                  key={t.teamId}
                  value={t.teamId}
                  title={t.competitionName}
                  className="max-w-[14rem] flex-none px-3 py-1.5"
                >
                  <span className="truncate">{t.teamName}</span>
                  {t.todos.length > 0 && (
                    <span
                      aria-label={`${t.todos.length} to do`}
                      className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-900 tabular-nums dark:bg-amber-950 dark:text-amber-200"
                    >
                      {t.todos.length}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {teams.map((t) => (
            <TabsContent key={t.teamId} value={t.teamId}>
              <ManagedTeamCard team={t} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </section>
  );
}

function ManagedTeamCard({ team: t }: { team: ManagedTeam }) {
  const todo = t.todos.length;
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="break-words">
              <Link href={`/teams/${t.teamId}`} className="hover:underline">
                {t.teamName}
              </Link>
            </CardTitle>
            <CardDescription className="break-words">
              {t.competitionName}
            </CardDescription>
          </div>
          {todo > 0 ? (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 tabular-nums dark:bg-amber-950 dark:text-amber-200">
              {todo} to do
            </span>
          ) : (
            <span className="bg-pine/15 text-pine shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold">
              All set
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {todo > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <p className="font-medium">Pending actions ({todo})</p>
            <ul className="mt-1 space-y-2">
              {t.todos.map((x) => (
                <li key={x.kind} className="flex gap-2">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0">
                    {x.text}
                    {"names" in x && (
                      <span className="block font-medium break-words">
                        {x.names.join(", ")}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {todo === 0 && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <CircleCheck className="text-pine size-4" />
            Nothing waiting on you.
          </p>
        )}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium tabular-nums">
              Players ({t.roster.length})
            </p>
            <InviteTeammateDialog
              teamId={t.teamId}
              teamName={t.teamName}
              pair={t.isPairs}
              label={t.isPairs ? undefined : "Add a player"}
            />
          </div>
          <CaptainRoster
            teamId={t.teamId}
            roster={t.roster}
            invites={t.invites}
            canManage
            // A joined partner IS the pair; changing one stays the organizer's.
            canRemoveMembers={!t.isPairs}
            subsAllowed={!t.isPairs}
            waiverSigned={t.waiverSigned}
          />
        </div>
      </CardContent>
    </Card>
  );
}
