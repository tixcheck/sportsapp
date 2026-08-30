import { notFound } from "next/navigation";

import { getReversePairs } from "@/lib/queries/reverse-pairs";
import { getUserOrgs } from "@/lib/auth/user";
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
import { ReversePairsStandingsCard } from "@/components/reverse-pairs/standings";
export default async function ReversePairsPage({
  params,
}: {
  params: Promise<{ orgId: string; id: string }>;
}) {
  const { orgId, id } = await params;
  const detail = await getReversePairs(id);
  if (!detail || detail.orgId !== orgId) notFound();

  const orgs = await getUserOrgs();
  const role = orgs.find((o) => o.id === orgId)?.role;
  const isAdmin = role === "owner" || role === "admin";

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

      {isAdmin && (
        <ReversePairsPublishCard
          competitionId={detail.competitionId}
          slug={detail.slug}
          isPublic={detail.visibility === "public"}
        />
      )}

      {isAdmin && (
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
      )}

      {isAdmin && feeSettings && feeRates && (
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
          }}
          rates={feeRates}
          payoutsReady={paymentAccountStatus(orgAccount).canAcceptPayments}
          unitLabel="pair"
        />
      )}

      {isAdmin && (
        <ReversePairsPairsCard
          competitionId={detail.competitionId}
          pairs={detail.pairs}
          courts={detail.settings.courts}
          locked={detail.games.length > 0}
        />
      )}

      {isAdmin && detail.pairs.length >= detail.settings.courts * 6 && (
        <GenerateReversePairsPanel
          competitionId={detail.competitionId}
          competitionName={detail.name}
          pairCount={detail.pairs.length}
          suggestions={detail.suggestions}
          initial={detail.settings}
          hasSchedule={detail.games.length > 0}
        />
      )}

      {detail.games.length > 0 && (
        <ReversePairsStandingsCard
          pairs={detail.pairs}
          standings={detail.standings}
        />
      )}

      <PartnerMatrixCard pairs={detail.pairs} matrix={detail.matrix} />

      <ReversePairsSchedule
        games={detail.games}
        byes={detail.byes}
        canEnterScores={isAdmin}
      />
    </div>
  );
}
