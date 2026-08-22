/**
 * Letting an embed take on the host site's colours. Pure: no DOM, no request.
 *
 * Two things make this more than a string substitution.
 *
 * **It is untrusted input going into CSS.** The colour arrives in a query
 * string on a public URL, so anything that isn't provably a hex triple is
 * discarded rather than sanitised — there is no such thing as a nearly-valid
 * colour, and a permissive parser here would be a CSS injection.
 *
 * **A brand colour is not automatically a readable colour.** Mango's #feb62a
 * against white is about 1.9:1, far below the 4.5:1 needed for body text. Using
 * it as-is where the app uses its accent would produce a table nobody can read.
 * So the accent is split in two: the colour itself, used for FILLS with a text
 * colour chosen to sit on it, and a darkened variant used when the accent has
 * to be text on the page background.
 */

export type EmbedTheme = {
  /** The brand colour, as given. Used for fills. */
  accent: string;
  /** Readable text ON the accent — near-black or white, whichever contrasts. */
  accentInk: string;
  /** The accent darkened until it's readable as text on the background. */
  accentText: string;
  background: string;
  /** Slightly off-background, for cards and sunken rows. */
  surface: string;
  /** Readable body text on the background. */
  ink: string;
  /** Hairlines and table rules. */
  rule: string;
};

const NEAR_BLACK = "#1c1714";
const WHITE = "#ffffff";

/**
 * A 6-digit hex colour, or null.
 *
 * Accepts an optional leading `#` and 3-digit shorthand because those are what
 * people paste; everything else — `red`, `rgb(...)`, anything with a bracket or
 * a semicolon — is rejected outright.
 */
export function parseHexColor(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(raw)) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  }
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
  return null;
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Whichever of near-black or white is readable on this colour. */
export function readableOn(hex: string): string {
  return contrastRatio(hex, NEAR_BLACK) >= contrastRatio(hex, WHITE)
    ? NEAR_BLACK
    : WHITE;
}

/**
 * Darken (or lighten) a colour until it reads against `on`.
 *
 * Steps toward black or white rather than jumping straight there, so a brand
 * colour stays recognisably itself — #feb62a becomes a deep amber, not brown.
 * Gives up at the extreme, which is always readable.
 */
export function shiftUntilReadable(
  hex: string,
  on: string,
  target = 4.5,
): string {
  if (contrastRatio(hex, on) >= target) return hex;
  const towardBlack = luminance(on) > 0.5;
  let current = channels(hex);
  for (let i = 0; i < 40; i++) {
    current = current.map((v) =>
      towardBlack ? v * 0.92 : v + (255 - v) * 0.12,
    ) as [number, number, number];
    const next = toHex(current);
    if (contrastRatio(next, on) >= target) return next;
  }
  return towardBlack ? NEAR_BLACK : WHITE;
}

/** Mix two colours, `amount` 0–1 toward `b`. */
function mix(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return toHex([
    ar + (br - ar) * amount,
    ag + (bg - ag) * amount,
    ab + (bb - ab) * amount,
  ]);
}

/**
 * Build a full palette from a brand accent and a background.
 *
 * Everything except those two is derived, because an organizer supplying six
 * colours would get one of them wrong and a table with an unreadable row is
 * worse than one that doesn't match their site.
 */
export function embedTheme({
  accent,
  background,
}: {
  accent?: string | null;
  background?: string | null;
}): EmbedTheme | null {
  const a = parseHexColor(accent);
  const bg = parseHexColor(background) ?? (a ? WHITE : null);
  if (!a || !bg) return null;

  const ink = readableOn(bg);
  return {
    accent: a,
    accentInk: readableOn(a),
    accentText: shiftUntilReadable(a, bg),
    background: bg,
    // Just enough separation to show a card edge without inventing a colour.
    surface: mix(bg, ink, 0.05),
    ink,
    rule: mix(bg, ink, 0.16),
  };
}

/**
 * The theme as CSS custom properties.
 *
 * Only ever built from values that survived `parseHexColor`, so nothing here
 * can carry anything but `#rrggbb`.
 */
export function embedThemeVars(theme: EmbedTheme): Record<string, string> {
  return {
    "--paper": theme.background,
    "--paper-raised": theme.background,
    "--paper-sunken": theme.surface,
    "--ink": theme.ink,
    "--ink-2": mix(theme.background, theme.ink, 0.65),
    "--ink-3": mix(theme.background, theme.ink, 0.45),
    "--rule": theme.rule,
    // The app's one spot colour becomes their brand colour — but the readable
    // variant, because it is used as small text (the leader's rank).
    "--claret": theme.accentText,
    "--claret-deep": theme.accentText,
    "--claret-tint": mix(theme.background, theme.accent, 0.25),
    "--primary": theme.accent,
    "--primary-foreground": theme.accentInk,
  };
}
