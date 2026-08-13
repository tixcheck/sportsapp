"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { quotePayment } from "@/lib/payments/fees";
import {
  platformFeeCentsFor,
  DEFAULT_PLATFORM_FEE_RATES,
} from "@/lib/payments/platform-fee";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents } from "@/lib/payments/format";

export type WizardPaymentValue = {
  feeDollars: number;
  allowCaptainPays: boolean;
  allowSplitPayment: boolean;
  taxEnabled: boolean;
  taxPercent: number;
  paymentRequired: boolean;
};

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
 * The wizard's Payment step.
 *
 * Priced in the same breath as everything else about the event, rather than
 * discovered on a settings page afterwards. Free is the default and the whole
 * step collapses to one field when the fee is zero — most events are free, and
 * they shouldn't have to read about tax to say so.
 *
 * The platform's live rates aren't available in the wizard (it's a client
 * component with no query), so the preview uses the shipped defaults. It's a
 * preview; the server recomputes from the real rates when anyone actually pays.
 */
export function WizardPaymentStep({
  value,
  onChange,
  error,
}: {
  value: WizardPaymentValue;
  onChange: (patch: Partial<WizardPaymentValue>) => void;
  error?: string;
}) {
  const feeCents = Math.round((Number(value.feeDollars) || 0) * 100);
  const isFree = feeCents === 0;

  const taxCents = value.taxEnabled
    ? Math.round((feeCents * (Number(value.taxPercent) || 0)) / 100)
    : 0;
  const quote = quotePayment({
    priceCents: feeCents,
    platformFeeCents: platformFeeCentsFor({
      competitionType: "tournament",
      payerMode: "captain_pays_team",
      chargeBaseCents: feeCents,
      rates: DEFAULT_PLATFORM_FEE_RATES,
    }),
    taxCents,
  });

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        What a team pays to enter. Leave it at zero for a free tournament — you
        can add a fee later from Settings.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="feeDollars">You receive, per team</Label>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">$</span>
          <Input
            id="feeDollars"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            className="max-w-40 tabular-nums"
            value={value.feeDollars}
            onChange={(e) =>
              onChange({ feeDollars: e.target.valueAsNumber || 0 })
            }
          />
          <span className="text-muted-foreground text-sm">CAD</span>
        </div>
        <p className="text-muted-foreground text-xs">
          This is what lands in your bank. Card and platform fees are added on
          top, not taken out of it.
        </p>
      </div>

      {!isFree && (
        <>
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              How teams can pay
            </p>
            <Toggle
              label="Captain pays for the team"
              desc="One payment covering the whole team fee."
              checked={value.allowCaptainPays}
              onChange={(v) => onChange({ allowCaptainPays: v })}
            />
            <Toggle
              label="Players pay their own share"
              desc="The team is confirmed once every share is in."
              checked={value.allowSplitPayment}
              onChange={(v) => onChange({ allowSplitPayment: v })}
            />
          </div>

          <Toggle
            label="Registration requires payment"
            desc="A team isn't confirmed until it has paid."
            checked={value.paymentRequired}
            onChange={(v) => onChange({ paymentRequired: v })}
          />

          <div className="space-y-2">
            <Toggle
              label="Collect tax"
              desc="Added on top and paid out to you to remit."
              checked={value.taxEnabled}
              onChange={(v) => onChange({ taxEnabled: v })}
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
                    onChange({ taxPercent: e.target.valueAsNumber || 0 })
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
              <dd className="font-semibold">{formatCents(quote.totalCents)}</dd>
            </div>
            {taxCents > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Including tax</dt>
                <dd>{formatCents(taxCents)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Card and platform fees</dt>
              <dd>{formatCents(quote.applicationFeeCents)}</dd>
            </div>
            <div className="border-border flex justify-between border-t pt-1.5">
              <dt className="font-medium">You receive</dt>
              <dd className="font-semibold">
                {formatCents(quote.organizerNetCents)}
              </dd>
            </div>
          </dl>
        </>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
