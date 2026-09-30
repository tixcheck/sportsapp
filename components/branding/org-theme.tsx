import { embedTheme, embedThemeCss } from "@/lib/embed/theme";

/**
 * Paint a public page in the organizer's brand colours.
 *
 * The same derivation the embedded schedules use, so contrast is worked out
 * rather than trusted: an organizer supplies an accent and maybe a background,
 * and text, card edges and the readable accent follow from those. Renders
 * nothing when the org has no brand, which leaves the app's own colours.
 *
 * `embedThemeCss` writes a `:root` rule — the only place an override reaches
 * every derived token — and only from values that parsed as `#rrggbb`.
 */
export function OrgTheme({
  accent,
  background,
}: {
  accent: string | null | undefined;
  background: string | null | undefined;
}) {
  const theme = embedTheme({ accent, background });
  if (!theme) return null;
  return <style dangerouslySetInnerHTML={{ __html: embedThemeCss(theme) }} />;
}
