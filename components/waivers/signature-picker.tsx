"use client";

import { Check } from "lucide-react";

import { SIGNATURE_STYLES, type SignatureStyle } from "@/lib/waivers/clauses";
import { cn } from "@/lib/utils";

/**
 * Choose how your signature looks, then sign with it.
 *
 * What gets stored is the typed NAME and the chosen STYLE — never an image.
 * A drawn or uploaded signature is a blob whose authenticity we would have to
 * defend; a name plus a style is re-rendered by us from what the signer typed,
 * so the record can't contain something they didn't produce.
 *
 * Three faces rather than one, because a signature somebody picked is theirs
 * in a way an imposed one isn't — and seeing the same name in three hands makes
 * it obvious this is a rendering, not a claim about their handwriting.
 */
const STYLE_LABEL: Record<SignatureStyle, string> = {
  flowing: "Flowing",
  formal: "Formal",
  casual: "Casual",
};

const STYLE_FONT: Record<SignatureStyle, string> = {
  flowing: "var(--font-sig-flowing)",
  formal: "var(--font-sig-formal)",
  casual: "var(--font-sig-casual)",
};

export function SignaturePicker({
  name,
  value,
  onChange,
  disabled = false,
}: {
  /** The name they typed — what each style renders. */
  name: string;
  value: SignatureStyle;
  onChange: (style: SignatureStyle) => void;
  disabled?: boolean;
}) {
  const shown = name.trim() || "Your name";

  return (
    <div className="grid gap-2">
      <p className="text-ink-2 text-sm font-medium">Choose your signature</p>

      <div className="grid gap-2 sm:grid-cols-3">
        {SIGNATURE_STYLES.map((style) => {
          const selected = value === style;
          return (
            <button
              key={style}
              type="button"
              disabled={disabled}
              onClick={() => onChange(style)}
              aria-pressed={selected}
              aria-label={`${STYLE_LABEL[style]} signature`}
              className={cn(
                "border-rule bg-surface flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg border px-3 py-3 transition-colors",
                selected
                  ? "border-primary bg-accent"
                  : "hover:border-primary/40",
                disabled && "opacity-60",
              )}
            >
              <span
                className="text-ink w-full truncate text-center text-2xl leading-tight"
                style={{ fontFamily: STYLE_FONT[style] }}
              >
                {shown}
              </span>
              <span className="text-muted-foreground flex items-center gap-1 text-[11px] tracking-wide uppercase">
                {selected && <Check className="size-3" />}
                {STYLE_LABEL[style]}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-ink-3 text-xs">
        We store the name you typed and the style you picked — not a picture.
      </p>
    </div>
  );
}
