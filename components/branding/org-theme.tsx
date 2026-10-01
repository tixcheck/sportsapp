import { orgPageCss } from "@/lib/branding/page-theme";

/**
 * Paint a public page in the organizer's brand colours.
 *
 * The CSS comes from `orgPageCss`, which works contrast out rather than
 * trusting it and only ever emits values that parsed as `#rrggbb`. Renders
 * nothing when the org has no brand, which leaves the app's own colours.
 */
export function OrgTheme({
  accent,
  background,
  secondary,
}: {
  accent: string | null | undefined;
  background: string | null | undefined;
  secondary?: string | null;
}) {
  const css = orgPageCss({ accent, background, secondary });
  if (!css) return null;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
