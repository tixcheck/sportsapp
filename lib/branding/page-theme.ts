import {
  embedTheme,
  embedThemeCss,
  luminance,
  mix,
  parseHexColor,
} from "@/lib/embed/theme";

/**
 * The CSS that paints an organizer's public page in their colours, or null for
 * an org with no brand (the page keeps the app's own).
 *
 * Built on the embed theme, which works out readable text and accents from the
 * accent and background. A whole page differs from an embed in two ways:
 *
 * - **White cards on a tinted page.** An embed sits inside someone else's site
 *   and should be one flat colour. A full page in one flat tint, cards and all,
 *   reads as a wash; white cards on the tint give it depth and keep the form
 *   crisp.
 * - **A wash from one brand colour to the other.** With a second colour the
 *   page runs from a faint tint of the accent at the top to a faint tint of the
 *   second at the bottom — Helix's logo is a magenta-to-teal ring, and a single
 *   tint only ever caught one end of it.
 *
 * Both only on a light page: on a dark one, white cards would glare, and the
 * tints are worked out against the background so they stay faint.
 *
 * Every colour has been through `parseHexColor`, so the string can only ever
 * contain `#rrggbb` values and the punctuation written here.
 */
export function orgPageCss({
  accent,
  background,
  secondary,
}: {
  accent?: string | null;
  background?: string | null;
  secondary?: string | null;
}): string | null {
  const theme = embedTheme({ accent, background });
  if (!theme) return null;

  const light = luminance(theme.background) > 0.6;
  const second = parseHexColor(secondary);
  const tinted = theme.background !== "#ffffff";

  let css = embedThemeCss(theme);
  if (!light) return css;

  if (tinted || second) {
    css += ":root{--paper-raised:#ffffff}";
  }
  if (second) {
    // The banner's backdrop otherwise shows as a grey band across the wash.
    css += `:root{--paper-sunken:${mix(theme.background, theme.accent, 0.08)}}`;
    // At least the window's height, unrepeated: on a short page the gradient
    // otherwise ends where the content does and starts over below it.
    css += `body{min-height:100vh;background-repeat:no-repeat;background-image:${brandWash(theme.background, theme.accent, second)}}`;
  }
  return css;
}

/**
 * The page wash: a faint tint of the accent at the top, through the background,
 * to a faint tint of the second colour at the bottom. Shared with the settings
 * card's preview so what an organizer sees is what their page gets.
 */
export function brandWash(
  background: string,
  accent: string,
  second: string,
): string {
  const top = mix(background, accent, 0.13);
  const bottom = mix(background, second, 0.2);
  return `linear-gradient(180deg,${top} 0%,${background} 45%,${bottom} 100%)`;
}
