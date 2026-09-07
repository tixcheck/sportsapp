"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { signWaiverAction } from "@/server/actions/waivers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  initialsFrom,
  missingInitials,
  renderWaiverBody,
  splitWaiverClauses,
  waiverNeedsAddress,
  waiverNeedsName,
  type SignatureStyle,
} from "@/lib/waivers/clauses";
import { SignaturePicker } from "@/components/waivers/signature-picker";
import { AddressInput } from "@/components/ui/address-input";

/**
 * Read the waiver, then agree to it.
 *
 * Two deliberate frictions. The agree control stays disabled until the text has
 * actually been scrolled to the end, because "I have read and agree" under a
 * box nobody opened is the part that falls over when it matters. And agreeing
 * means typing your name rather than ticking a box — a signature is a positive
 * act, and the typed name is what the record stores.
 *
 * The checksum of the text shown here is sent back and verified server-side
 * against the stored waiver, so a tab left open across a new version cannot
 * record agreement to wording that was never on screen.
 */
export function SignWaiver({
  competitionId,
  competitionName,
  waiverId,
  title,
  body,
  bodySha256,
  suggestedName,
  onSigned,
  blockedReason,
  requireInitials = false,
  addressAutocomplete = false,
}: {
  competitionId: string;
  competitionName: string;
  waiverId: string;
  title: string;
  body: string;
  bodySha256: string;
  /** Their display name, offered as a starting point. */
  suggestedName: string;
  /** Called after a successful signature, for flows that advance a step. */
  onSigned?: () => void;
  /**
   * Why signing is held, when something must happen first — the organizer's
   * own questions, typically. Signing is an assertion about what you have
   * done, so it should not be possible before the rest of it is true.
   */
  blockedReason?: string;
  /**
   * Ask for initials against each numbered clause. Ignored when the document
   * has no numbered structure — initials against headings we guessed at would
   * be evidence of nothing.
   */
  requireInitials?: boolean;
  /** Whether an address key is configured; false renders a plain input. */
  addressAutocomplete?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [readToEnd, setReadToEnd] = useState(false);
  const [name, setName] = useState(suggestedName);
  const [initials, setInitials] = useState<Record<string, string>>({});
  const [address, setAddress] = useState("");
  const [style, setStyle] = useState<SignatureStyle>("flowing");

  // Their own details, put into the wording before it is read — a waiver that
  // says "I, Priya Sharma, residing at 12 Main St" is a different act of
  // agreement from one that says "I, ____".
  const needsAddress = waiverNeedsAddress(body);
  const filled = useMemo(
    () => renderWaiverBody(body, { name, address }),
    [body, name, address],
  );

  // Split with the same function the server uses, so the two cannot disagree
  // about how many clauses this document has.
  const { preamble, clauses } = useMemo(
    () => splitWaiverClauses(filled),
    [filled],
  );
  const clauseMode = requireInitials && clauses.length > 0;
  const outstanding = clauseMode ? missingInitials(clauses, initials) : [];
  /**
   * Clause mode replaces the scroll gate rather than adding to it: reading is
   * demonstrated by initialling each section, and requiring a scroll as well
   * would block someone whose screen shows the whole thing at once.
   */
  const ready = clauseMode || readToEnd;

  /** Offer their initials against every clause at once, Adobe-style. */
  function applyToAll() {
    const value = initialsFrom(name);
    if (!value) {
      toast.error("Type your name first.");
      return;
    }
    setInitials(
      Object.fromEntries(clauses.map((c) => [String(c.number), value])),
    );
  }

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    // A small tolerance: sub-pixel heights mean the exact bottom is rarely hit.
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 24)
      setReadToEnd(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await signWaiverAction({
        competitionId,
        waiverId,
        signedName: name,
        bodySha256,
        clauseInitials: clauseMode ? initials : undefined,
        signatureStyle: style,
        signedAddress: needsAddress ? address : undefined,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Thanks — that's recorded.");
      onSigned?.();
      router.refresh();
    });
  }

  return (
    <section className="border-claret/40 bg-claret-tint/30 rounded-xl border p-5">
      <p className="text-claret flex items-center gap-2 text-xs font-semibold tracking-[0.16em] uppercase">
        <ShieldCheck className="size-4" />
        Before you play
      </p>

      <h2 className="mt-2 text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-ink-2 mt-1 text-sm">
        {competitionName} needs this from every player. Your team isn&rsquo;t
        confirmed until everyone on it has agreed.
      </p>

      {/*
        Above the wording, not below it. The document quotes these back, so
        they have to be given before there is anything to read — filling in a
        form that appears underneath the sentence it completes reads backwards.
      */}
      {(needsAddress || waiverNeedsName(body)) && (
        <div className="border-rule bg-surface mt-4 grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="waiver-name">Your full legal name</Label>
            <Input
              id="waiver-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Priya Sharma"
              disabled={pending}
            />
          </div>
          {needsAddress && (
            <div className="grid gap-1.5">
              <Label htmlFor="waiver-address">Your address</Label>
              <AddressInput
                id="waiver-address"
                value={address}
                onChange={setAddress}
                placeholder="12 Main St, Brampton ON L6X 1A1"
                disabled={pending}
                available={addressAutocomplete}
              />
            </div>
          )}
        </div>
      )}

      {clauseMode ? (
        <div className="mt-4 grid gap-3">
          {preamble && (
            <div className="border-rule bg-surface text-ink-2 rounded-lg border p-4 text-sm leading-relaxed whitespace-pre-wrap">
              {preamble}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-ink-2 text-sm">
              Initial each section to show you have read it.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={applyToAll}
              disabled={pending}
            >
              Apply my initials to all
            </Button>
          </div>

          {clauses.map((c) => {
            const value = initials[String(c.number)] ?? "";
            return (
              <div
                key={c.number}
                className={cn(
                  "border-rule bg-surface grid gap-2 rounded-lg border p-4 sm:grid-cols-[1fr_auto]",
                  value.trim() !== "" && "border-pine/40",
                )}
              >
                <div className="min-w-0">
                  <p className="text-ink text-sm font-semibold">
                    {c.number}. {c.heading}
                  </p>
                  <p className="text-ink-2 mt-1 text-sm leading-relaxed whitespace-pre-wrap">
                    {c.body}
                  </p>
                </div>

                <label className="grid content-start gap-1">
                  <span className="text-muted-foreground text-[11px] tracking-wide uppercase">
                    Initials
                  </span>
                  <Input
                    value={value}
                    onChange={(e) =>
                      setInitials((prev) => ({
                        ...prev,
                        [String(c.number)]: e.target.value.toUpperCase(),
                      }))
                    }
                    maxLength={8}
                    disabled={pending}
                    aria-label={`Initials for section ${c.number}, ${c.heading}`}
                    className="w-20 text-center font-semibold tracking-widest uppercase"
                  />
                </label>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          onScroll={onScroll}
          className="border-rule bg-surface text-ink-2 mt-4 max-h-64 overflow-y-auto rounded-lg border p-4 text-sm leading-relaxed whitespace-pre-wrap"
        >
          {filled}
        </div>
      )}

      {blockedReason ? (
        <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-300">
          {blockedReason}
        </p>
      ) : clauseMode ? (
        outstanding.length > 0 && (
          <p className="text-ink-3 mt-2 text-xs">
            Still to initial: section{outstanding.length === 1 ? "" : "s"}{" "}
            {outstanding.join(", ")}.
          </p>
        )
      ) : (
        !readToEnd && (
          <p className="text-ink-3 mt-2 text-xs">
            Scroll to the end of the waiver to continue.
          </p>
        )
      )}

      <form onSubmit={submit} className="mt-4 grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="waiver-sign">Type your full name to agree</Label>
          <Input
            id="waiver-sign"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!ready}
            autoComplete="name"
            placeholder="Your full name"
            className={cn(!ready && "opacity-60")}
          />
        </div>

        <SignaturePicker
          name={name}
          value={style}
          onChange={setStyle}
          disabled={pending || !ready}
        />

        <Button
          type="submit"
          disabled={
            pending ||
            !ready ||
            name.trim().length < 2 ||
            (needsAddress && address.trim().length < 5) ||
            !!blockedReason ||
            outstanding.length > 0
          }
          className="justify-self-start"
        >
          {pending ? "Recording…" : "I agree"}
        </Button>
      </form>

      <p className="text-ink-3 mt-3 text-xs">
        We record your name, the date, and the exact wording you agreed to. It
        can be seen by you and by the organizer of this competition, and nobody
        else.
      </p>
    </section>
  );
}
