import { embedTheme, embedThemeCss } from "@/lib/embed/theme";

/**
 * Wraps an embed in the host site's colours.
 *
 * Takes the raw query values and hands them to `embedTheme`, which discards
 * anything that isn't provably a hex triple — so nothing but `#rrggbb` can ever
 * reach the stylesheet. Without valid colours this renders the default palette
 * and nothing else changes.
 *
 * The colours go in a `:root` rule rather than a `style` attribute on the div
 * below, and that distinction is the whole feature. `globals.css` derives
 * `--background`, `--border`, `--card`, `--foreground` and the legacy
 * `--surface`/`--text` aliases FROM the raw tokens, at :root. Custom properties
 * substitute where they are declared, so those aliases are fixed to the default
 * palette before any descendant is reached — an inline override of `--paper`
 * moved `bg-paper` and left `bg-background` beige, including on `body`, which
 * is what filled the rest of a 700px-tall iframe. Mango's developer reported
 * exactly that: "even though bg=ffffff is passed, the embed continues to render
 * with the default beige".
 *
 * Only ever rendered on /embed/l/[slug]/*, which has its own chrome-free
 * layout — a :root rule from here cannot reach the rest of the app.
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
    <>
      {/* Plain children rather than dangerouslySetInnerHTML: the CSS is only
          `:root{--name:#rrggbb;…}`, so there is nothing for React to escape —
          and this codebase has no raw-HTML injection anywhere else. */}
      {theme && <style>{embedThemeCss(theme)}</style>}
      <div className="bg-background text-foreground p-3">{children}</div>
    </>
  );
}
