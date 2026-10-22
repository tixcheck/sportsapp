import Link from "next/link";
import { notFound } from "next/navigation";

import { getTeamView } from "@/lib/queries/team-view";
import { competitionPath } from "@/lib/queries/dashboard";
import {
  getCompetitionPaymentSettings,
  getPaymentAccount,
  getPlatformFeeRatesFor,
  getTeamPaymentRows,
} from "@/lib/queries/payments";
import { paymentAccountStatus } from "@/lib/payments/account-status";
import {
  planMemberShares,
  planTeamCharge,
  teamPaymentState,
} from "@/lib/payments/registration-plan";
import { TeamPaymentCard } from "@/components/payments/team-payment-card";
import { ScheduleView } from "@/components/schedule/schedule-view";
import { EntryGate } from "@/components/team/entry-gate";
import {
  getTeamEntryGate,
  getTeamWaiverSigned,
} from "@/lib/queries/team-entry";
import { InviteTeammateDialog } from "@/components/team/invite-teammate-dialog";
import { CaptainRoster } from "@/components/team/captain-roster";
import { getPendingTeamInvites } from "@/lib/queries/roster";
import { MatchSections } from "@/components/scoring/match-sections";
import {
  StandingsTable,
  StandingsLegend,
} from "@/components/standings/standings-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { teamId } = await params;
  // Stripe sends the payer back here with ?paid=1 or ?paid=0. Nothing read it,
  // so a payment that failed or was cancelled looked like nothing happened
  // (a player review: "the payment did not go through").
  const { paid } = await searchParams;
  const view = await getTeamView(teamId);
  if (!view) notFound(); // not a member or competition admin

  const {
    team,
    competition,
    isMember,
    myMatches,
    projections,
    teamSchedule,
    standingsGroup,
    differential,
    simpleStandings,
    roster,
  } = view;

  // Registration fee. getTeamView already gated on membership/admin, so the
  // org id it exposes is one this viewer may read.
  const [feeSettings, feeRates, paymentRows] = await Promise.all([
    getCompetitionPaymentSettings(competition.id),
    getPlatformFeeRatesFor(competition.id),
    getTeamPaymentRows(team.id),
  ]);
  const orgAccount = await getPaymentAccount(view.orgId);
  // A held team has no fixtures to show, and saying "no matches yet" would
  // send its captain looking for a scheduling fault instead of doing the one
  // thing that would fix it — chasing a signature, or finding a sixth player.
  const [entryGate, waiverSigned] = await Promise.all([
    getTeamEntryGate(team.id),
    getTeamWaiverSigned(team.id, competition.id),
  ]);
  const payment = teamPaymentState(paymentRows, {
    feeCents: feeSettings.registrationFeeCents,
  });
  // Quote the outstanding amount, not the full fee — a part-paid team owes the
  // remainder, and charging them the whole thing again would be theft.
  const [outstandingCharge] = planTeamCharge({
    pricing: {
      registrationFeeCents: payment.outstandingPriceCents,
      taxEnabled: feeSettings.taxEnabled,
      taxPercent: feeSettings.taxPercent,
    },
    competitionType: competition.type,
    rates: feeRates,
  });
  const canPayOnline = paymentAccountStatus(orgAccount).canAcceptPayments;
  // Matches `inviteTeammateAction`, which allows the captain or an organizer.
  // Without this the gate's "the captain can add them below" pointed at a
  // read-only list.
  const canInvite =
    view.isAdmin ||
    roster.some((m) => m.role === "captain" && m.userId === view.viewerId);
  // The same people may also remove players and manage invites (2026-10-16).
  const pendingInvites = canInvite ? await getPendingTeamInvites(team.id) : [];
  const isPairs = (competition.type as string) === "reverse_pairs";
  // Split shares only when the organizer allows them. planMemberShares reads
  // the roster we already loaded, so this costs no extra query.
  const shares = feeSettings.allowSplitPayment
    ? planMemberShares({
        pricing: {
          registrationFeeCents: feeSettings.registrationFeeCents,
          taxEnabled: feeSettings.taxEnabled,
          taxPercent: feeSettings.taxPercent,
        },
        competitionType: competition.type,
        rates: feeRates,
        members: roster,
        existingShares: paymentRows.filter((r) => r.kind === "player_share"),
      })
    : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href={competitionPath(competition.type, competition.slug)}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {competition.name}
        </Link>
        <h1 className="font-display text-foreground mt-1 text-2xl font-semibold tracking-tight">
          {team.name}
        </h1>
      </div>

      {paid === "0" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Your payment didn&apos;t go through.</p>
          <p>
            Nothing was charged. Use the payment button below to try again —
            your team&apos;s spot isn&apos;t confirmed until it&apos;s paid.
          </p>
        </div>
      )}
      {paid === "1" && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-medium">Payment received — thank you.</p>
          <p>It can take a minute to show as paid below.</p>
        </div>
      )}

      <TeamPaymentCard
        competitionId={competition.id}
        teamId={team.id}
        payment={payment}
        totalDueCents={outstandingCharge?.totalCents ?? 0}
        canPayOnline={canPayOnline}
        paypalUrl={feeSettings.paypalTeamUrl}
        canPay={isMember || view.isAdmin}
        allowCaptainPays={feeSettings.allowCaptainPays}
        shares={shares}
        viewerEmail={view.viewerEmail}
        isAdmin={view.isAdmin}
      />

      {/* A Reverse Pairs pair has no matches of its own — its games live on
          the event page, drawn once sign-ups close. Showing the league cards
          here would say "No matches yet" forever. */}
      {(competition.type as string) === "reverse_pairs" ? (
        <Card>
          <CardHeader>
            <CardTitle>Schedule &amp; standings</CardTitle>
            <CardDescription>
              Partners change every game, so the schedule is drawn for the whole
              field once sign-ups close.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={competitionPath(competition.type, competition.slug)}
              className="text-claret text-sm font-medium hover:underline"
            >
              See the event page →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Schedule */}
          <Card>
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
              <CardDescription>
                Match order is set; times are estimates.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {entryGate ? (
                <EntryGate
                  gate={entryGate}
                  isMember={isMember || view.isAdmin}
                  viewerId={view.viewerId}
                />
              ) : isMember ? (
                myMatches.length === 0 && projections.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No matches yet.
                  </p>
                ) : (
                  <MatchSections
                    matches={myMatches}
                    projections={projections}
                  />
                )
              ) : (
                <ScheduleView
                  matches={teamSchedule}
                  timezone={competition.timezone}
                  myTeamIds={[team.id]}
                  sport={competition.sport}
                />
              )}
            </CardContent>
          </Card>

          {/* Standing */}
          <Card>
            <CardHeader>
              <CardTitle>Standing</CardTitle>
              {standingsGroup?.poolName && (
                <CardDescription>{standingsGroup.poolName}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {standingsGroup ? (
                <div className="space-y-3">
                  <StandingsTable
                    rows={standingsGroup.rows}
                    myTeamIds={[team.id]}
                    sport={competition.sport}
                    differential={differential}
                    simple={simpleStandings}
                  />
                  <StandingsLegend
                    sport={competition.sport}
                    differential={differential}
                    simple={simpleStandings}
                  />
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Standings appear once scores come in.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Roster */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Roster</CardTitle>
            {canInvite && (
              <InviteTeammateDialog
                teamId={team.id}
                teamName={team.name}
                pair={(competition.type as string) === "reverse_pairs"}
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <CaptainRoster
            teamId={team.id}
            roster={roster}
            invites={pendingInvites}
            canManage={canInvite}
            // A joined partner IS the pair; changing one stays the organizer's.
            canRemoveMembers={view.isAdmin || !isPairs}
            subsAllowed={!isPairs}
            waiverSigned={waiverSigned}
          />
        </CardContent>
      </Card>
    </div>
  );
}
