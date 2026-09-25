import { notFound } from "next/navigation";

import { getReversePairs } from "@/lib/queries/reverse-pairs";
import { createClient } from "@/lib/supabase/server";
import {
  getCompetitionPaymentSettings,
  getPlatformFeeRatesFor,
  getPaymentAccount,
} from "@/lib/queries/payments";
import { paymentAccountStatus } from "@/lib/payments/account-status";
import { RegistrationFeeCard } from "@/components/payments/registration-fee-card";
import { GenerateReversePairsPanel } from "@/components/reverse-pairs/generate-panel";
import { PartnerMatrixCard } from "@/components/reverse-pairs/partner-matrix";
import { ReversePairsPairsCard } from "@/components/reverse-pairs/pairs-card";
import { ReversePairsPublishCard } from "@/components/reverse-pairs/publish-card";
import { ReversePairsSettingsCard } from "@/components/reverse-pairs/settings-card";
import { ReversePairsSchedule } from "@/components/reverse-pairs/schedule";
import { ReversePairsSwapCard } from "@/components/reverse-pairs/swap-card";
import { ReversePairsStandingsCard } from "@/components/reverse-pairs/standings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function ReversePairsPage({
  params,
}: {
  params: Promise<{ orgId: string; id: string }>;
}) {
  const { orgId, id } = await params;
  const detail = await getReversePairs(id);
  if (!detail || detail.orgId !== orgId) notFound();

  // The SAME test the actions enforce, not a hand-rolled role comparison.
  //
  // This used to be `role === "owner" || role === "admin"` from getUserOrgs(),
  // which is narrower than `is_competition_admin`: that also admits an org
  // member with role 'organizer' and anyone in `competition_admins`. BVL's two
  // organizers — the people who actually run the nights — passed every score
  // action and were shown a read-only page with no score boxes, because the UI
  // and the server disagreed about who counts.
  const supabase = await createClient();
  const { data: canManage } = await supabase.rpc("is_competition_admin", {
    _competition_id: id,
  });
  const isAdmin = canManage === true;

  const [feeSettings, feeRates, orgAccount] = isAdmin
    ? await Promise.all([
        getCompetitionPaymentSettings(detail.competitionId),
        getPlatformFeeRatesFor(detail.competitionId),
        getPaymentAccount(orgId),
      ])
    : [null, null, null];

  const played = detail.games.filter((g) => g.scoreA !== null).length;
  const counts = [...detail.gamesPerPair.values()];
  const minGames = counts.length ? Math.min(...counts) : 0;
  const maxGames = counts.length ? Math.max(...counts) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
          {detail.name}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Reverse Pairs · {detail.pairs.length} pairs · {detail.settings.courts}{" "}
          courts
          {detail.games.length > 0 && (
            <>
              {" "}
              ·{" "}
              {minGames === maxGames
                ? `${minGames} games each`
                : `${minGames}–${maxGames} games each`}
            </>
          )}
          {played > 0 && ` · ${played} of ${detail.games.length} scored`}
        </p>
      </div>

      {/*
        Grouped by WHEN each thing is used, not by what it is. The whole page
        was one column, so running a night meant scrolling past the registration
        fee and the publish toggle to reach the score boxes — on a phone, at the
        side of a court, between games.

        "Tonight" is the default because that is where the night is run. An
        organizer who has not drawn yet lands on Setup instead, which is where
        their next action actually is.
      */}
      <Tabs
        defaultValue={
          detail.games.length === 0 && isAdmin ? "setup" : "tonight"
        }
        className="space-y-5"
      >
        {/* Wraps rather than overflows: four tabs do not fit 375px in a row. */}
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="tonight">Tonight</TabsTrigger>
          <TabsTrigger value="standings">Standings</TabsTrigger>
          {isAdmin && <TabsTrigger value="setup">Setup</TabsTrigger>}
          {isAdmin && <TabsTrigger value="settings">Settings</TabsTrigger>}
        </TabsList>

        <TabsContent value="tonight" className="space-y-6">
          {/* Before the whistle, so above the scores it would otherwise lock. */}
          {isAdmin && detail.games.length > 0 && (
            <ReversePairsSwapCard
              competitionId={detail.competitionId}
              pairs={detail.pairs}
              sittingOutFirst={detail.byes[0] ?? []}
              locked={detail.games.some((g) => g.scoreA !== null)}
            />
          )}

          <ReversePairsSchedule
            games={detail.games}
            byes={detail.byes}
            canEnterScores={isAdmin}
          />
        </TabsContent>

        <TabsContent value="standings" className="space-y-6">
          {detail.games.length > 0 && (
            <ReversePairsStandingsCard
              pairs={detail.pairs}
              standings={detail.standings}
            />
          )}
          <PartnerMatrixCard pairs={detail.pairs} matrix={detail.matrix} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="setup" className="space-y-6">
            <ReversePairsPairsCard
              competitionId={detail.competitionId}
              pairs={detail.pairs}
              courts={detail.settings.courts}
              locked={detail.games.length > 0}
            />

            {detail.pairs.length >= detail.settings.courts * 6 && (
              <GenerateReversePairsPanel
                competitionId={detail.competitionId}
                competitionName={detail.name}
                pairCount={detail.pairs.length}
                suggestions={detail.suggestions}
                initial={detail.settings}
                hasSchedule={detail.games.length > 0}
              />
            )}
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="settings" className="space-y-6">
            <ReversePairsPublishCard
              competitionId={detail.competitionId}
              slug={detail.slug}
              isPublic={detail.visibility === "public"}
            />

            <ReversePairsSettingsCard
              competitionId={detail.competitionId}
              timezone={detail.timezone}
              pairCount={detail.pairs.length}
              initial={{
                name: detail.name,
                date: detail.startDate ?? "",
                venue: detail.venue ?? "",
                courts: detail.settings.courts,
                minutesPerGame: detail.settings.minutesPerGame,
                pointsPerGame: detail.pointsPerGame,
                registrationOpen: detail.settings.registrationOpen,
                registrationDeadline: detail.settings.registrationDeadline,
                maxPairs: detail.settings.maxPairs,
              }}
            />

            {feeSettings && feeRates && (
              <RegistrationFeeCard
                competitionId={detail.competitionId}
                competitionType="reverse_pairs"
                initial={{
                  feeDollars: feeSettings.registrationFeeCents / 100,
                  allowCaptainPays: feeSettings.allowCaptainPays,
                  allowSplitPayment: feeSettings.allowSplitPayment,
                  taxEnabled: feeSettings.taxEnabled,
                  taxPercent: feeSettings.taxPercent,
                  paymentRequired: feeSettings.paymentRequired,
                  etransferEmail: feeSettings.etransferEmail ?? "",
                  etransferNote: feeSettings.etransferNote ?? "",
                  paypalTeamUrl: feeSettings.paypalTeamUrl ?? "",
                  paypalIndividualUrl: feeSettings.paypalIndividualUrl ?? "",
                  paypalNote: feeSettings.paypalNote ?? "",
                }}
                rates={feeRates}
                payoutsReady={
                  paymentAccountStatus(orgAccount).canAcceptPayments
                }
                unitLabel="pair"
              />
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
