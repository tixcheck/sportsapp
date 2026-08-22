import { embedTheme, embedThemeVars } from "@/lib/embed/theme";

/**
 * Wraps an embed in the host site's colours.
 *
 * Takes the raw query values and hands them to `embedTheme`, which discards
 * anything that isn't provably a hex triple — so nothing but `#rrggbb` can ever
 * reach the style attribute. Without valid colours this renders the default
 * palette and nothing else changes.
 */
export function EmbedTheme({
  accent,
  background,
  children,
}: {
  accent?: string | string[];
  background?: string | string[];
  children: React.ReactNode;
}) {
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  const theme = embedTheme({
    accent: one(accent),
    background: one(background),
  });

  return (
    <div
      className="bg-background text-foreground p-3"
      style={theme ? (embedThemeVars(theme) as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
