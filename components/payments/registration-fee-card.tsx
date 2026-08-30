"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { quotePayment } from "@/lib/payments/fees";
import {
  platformFeeCentsFor,
  type CompetitionType,
  type PlatformFeeRates,
} from "@/lib/payments/platform-fee";
import type { RegistrationFeeInput } from "@/server/actions/payments";
import { updateRegistrationFeeAction } from "@/server/actions/payments";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents } from "@/lib/payments/format";

function Toggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors",
        checked ? "border-primary bg-accent" : "border-border bg-surface",
        "hover:bg-muted",
      )}
    >
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">{desc}</span>
      </span>
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-md border",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border",
        )}
      >
        {checked && <Check className="size-3.5" />}
      </span>
    </button>
  );
}

/**
 * Set what a team pays to register.
 *
 * `unitLabel` renames the entrant for formats where "team" is the wrong noun —
 * a Reverse Pairs entrant is a pair, and calling it a team on the screen where
 * you set its price reads like a different product.
 *
 * The organizer types what they want to NET; the breakdown shows what the payer
 * is actually charged. Showing both is the point — a pass-through model is only
 * honest if the person setting the price can see the number the payer will see,
 * before they save it.
 */
export function RegistrationFeeCard({
  competitionId,
  competitionType,
  unitLabel = "team",
  initial,
  rates,
  payoutsReady,
}: {
  competitionId: string;
  competitionType: CompetitionType;
  /** What one entrant is called: "team" (default) or e.g. "pair". */
  unitLabel?: string;
  initial: RegistrationFeeInput;
  rates: PlatformFeeRates;
  /** Whether the org's Stripe account can actually take money yet. */
  payoutsReady: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState<RegistrationFeeInput>(initial);

  const set = (patch: Partial<RegistrationFeeInput>) =>
    setValue((v) => ({ ...v, ...patch }));

  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  const feeCents = Math.round((Number(value.feeDollars) || 0) * 100);
  const isFree = feeCents === 0;
  const noMode = !isFree && !value.allowCaptainPays && !value.allowSplitPayment;

  // Preview the captain-pays-in-full case: it is the mode that is on by
  // default, and the one an organizer pictures when setting a team price.
  const taxCents = value.taxEnabled
    ? Math.round((feeCents * (Number(value.taxPercent) || 0)) / 100)
    : 0;
  const quote = quotePayment({
    priceCents: feeCents,
    platformFeeCents: platformFeeCentsFor({
      competitionType,
      payerMode: "captain_pays_team",
      chargeBaseCents: feeCents,
      rates,
    }),
    taxCents,
  });

  function save() {
    start(async () => {
      const res = await updateRegistrationFeeAction(competitionId, value);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        isFree ? "Registration is free." : "Registration fee saved.",
      );
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registration fee</CardTitle>
        <CardDescription>
          What a {unitLabel} pays to register. Leave it at zero to keep
          registration free.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {!payoutsReady && !isFree && (
          <p className="rounded-lg bg-amber-100 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            You can set a price now, but {unitLabel}s cannot pay by card until
            this organization finishes connecting Stripe. Cash and e-transfer
            still work as they always have.
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="fee">You receive, per {unitLabel}</Label>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">$</span>
            <Input
              id="fee"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              className="max-w-40 tabular-nums"
              value={value.feeDollars}
              onChange={(e) => set({ feeDollars: e.target.valueAsNumber || 0 })}
            />
            <span className="text-muted-foreground text-sm">CAD</span>
          </div>
          <p className="text-muted-foreground text-xs">
            This is what lands in your bank. Fees are added on top of it, not
            taken out of it.
          </p>
        </div>

        {!isFree && (
          <>
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                How {unitLabel}s can pay
              </p>
              <Toggle
                label={`One person pays for the ${unitLabel}`}
                desc={`A single payment covering the whole ${unitLabel} fee.`}
                checked={value.allowCaptainPays}
                onChange={(v) => set({ allowCaptainPays: v })}
              />
              <Toggle
                label="Players pay their own share"
                desc={`The ${unitLabel} is confirmed once every share is in.`}
                checked={value.allowSplitPayment}
                onChange={(v) => set({ allowSplitPayment: v })}
              />
              {noMode && (
                <p className="text-destructive text-sm">
                  Pick at least one way for {unitLabel}s to pay.
                </p>
              )}
            </div>

            <Toggle
              label="Registration requires payment"
              desc={`A ${unitLabel} is not confirmed until it has paid.`}
              checked={value.paymentRequired}
              onChange={(v) => set({ paymentRequired: v })}
            />

            {/* E-transfer is the address, not a toggle: an organizer who
                hasn't given one isn't offering it, so there's no second switch
                that can disagree with the field beside it. */}
            <div className="space-y-2">
              <label className="grid gap-1">
                <span className="text-sm font-medium">
                  Accept e-transfer{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </span>
                <span className="text-muted-foreground text-xs">
                  Teams send the fee straight to you and register as pending
                  until you confirm it arrived. Leave blank to take cards only.
                </span>
                <Input
                  type="email"
                  inputMode="email"
                  placeholder="treasurer@yourleague.ca"
                  value={value.etransferEmail ?? ""}
                  onChange={(e) => set({ etransferEmail: e.target.value })}
                />
              </label>

              {!!value.etransferEmail && (
                <label className="grid gap-1 pl-1">
                  <span className="text-muted-foreground text-xs">
                    Anything they should include in the transfer message
                  </span>
                  <Input
                    placeholder={`Put your ${unitLabel} name in the message`}
                    value={value.etransferNote ?? ""}
                    onChange={(e) => set({ etransferNote: e.target.value })}
                  />
                </label>
              )}

              {!!value.etransferEmail && !isFree && (
                <p className="text-muted-foreground pl-1 text-xs">
                  We never see this money, so our{" "}
                  {formatCents(
                    platformFeeCentsFor({
                      competitionType,
                      payerMode: "captain_pays_team",
                      chargeBaseCents: feeCents,
                      rates,
                    }),
                  )}{" "}
                  fee per {unitLabel} can&apos;t come out of it — it&apos;s
                  recorded as owed and settled separately.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Toggle
                label="Collect tax"
                desc="Added on top and paid out to you to remit."
                checked={value.taxEnabled}
                onChange={(v) => set({ taxEnabled: v })}
              />
              {value.taxEnabled && (
                <div className="flex items-center gap-2 pl-1">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.001"
                    aria-label="Tax percent"
                    className="max-w-28 tabular-nums"
                    value={value.taxPercent}
                    onChange={(e) =>
                      set({ taxPercent: e.target.valueAsNumber || 0 })
                    }
                  />
                  <span className="text-muted-foreground text-sm">
                    % (Ontario HST is 13%)
                  </span>
                </div>
              )}
            </div>

            <dl className="bg-paper-sunken space-y-1.5 rounded-lg p-3 text-sm tabular-nums">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Team pays</dt>
                <dd className="font-semibold">
                  {formatCents(quote.totalCents)}
                </dd>
              </div>
              {taxCents > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Including tax</dt>
                  <dd>{formatCents(taxCents)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Card and platform fees
                </dt>
                <dd>{formatCents(quote.applicationFeeCents)}</dd>
              </div>
              <div className="border-border flex justify-between border-t pt-1.5">
                <dt className="font-medium">You receive</dt>
                <dd className="font-semibold">
                  {formatCents(quote.organizerNetCents)}
                </dd>
              </div>
            </dl>
            <p className="text-muted-foreground text-xs">
              Based on one person paying the full {unitLabel} fee. Shares paid
              individually are priced per player.
            </p>
          </>
        )}

        <Button
          onClick={save}
          disabled={pending || !dirty || noMode}
          className="w-full sm:w-auto"
        >
          {pending ? "Saving…" : "Save registration fee"}
        </Button>
      </CardContent>
    </Card>
  );
}
