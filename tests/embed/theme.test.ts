import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  embedTheme,
  embedThemeCss,
  embedThemeVars,
  luminance,
  parseHexColor,
  readableOn,
  shiftUntilReadable,
} from "@/lib/embed/theme";

/** Mango Sports' brand: a bright amber on white. */
const MANGO = "#feb62a";
const WHITE = "#ffffff";

describe("parseHexColor", () => {
  it("takes the forms people actually paste", () => {
    expect(parseHexColor("#feb62a")).toBe("#feb62a");
    expect(parseHexColor("feb62a")).toBe("#feb62a");
    expect(parseHexColor("  #FEB62A  ")).toBe("#feb62a");
    expect(parseHexColor("#fff")).toBe("#ffffff");
  });

  it("rejects anything that isn't provably a hex triple", () => {
    // This value arrives in a query string on a public URL. There is no such
    // thing as a nearly-valid colour, so nothing is salvaged.
    for (const bad of [
      "red",
      "rgb(255,0,0)",
      "#12345",
      "#1234567",
      "url(x)",
      "red;background:url(evil)",
      "#ff0000;}",
      "expression(alert(1))",
      "",
      null,
      undefined,
    ]) {
      expect(parseHexColor(bad)).toBeNull();
    }
  });
});

describe("contrast", () => {
  it("agrees with the known extremes", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("confirms the brand colour is unreadable as text on white", () => {
    // The reason this module exists rather than substituting the colour.
    expect(contrastRatio(MANGO, WHITE)).toBeLessThan(2);
  });

  it("orders luminance sensibly", () => {
    expect(luminance("#000000")).toBeLessThan(luminance(MANGO));
    expect(luminance(MANGO)).toBeLessThan(luminance(WHITE));
  });
});

describe("readableOn", () => {
  it("puts dark text on a bright brand colour", () => {
    expect(readableOn(MANGO)).toBe("#1c1714");
    expect(contrastRatio(MANGO, readableOn(MANGO))).toBeGreaterThan(4.5);
  });

  it("puts light text on a dark one", () => {
    expect(readableOn("#111827")).toBe("#ffffff");
  });
});

describe("shiftUntilReadable", () => {
  it("darkens the brand colour until it passes on white", () => {
    const text = shiftUntilReadable(MANGO, WHITE);
    expect(contrastRatio(text, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps it recognisably the same hue — amber, not brown", () => {
    const text = shiftUntilReadable(MANGO, WHITE);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(text.slice(i, i + 2), 16));
    // Red still leads, blue still trails: the colour was darkened, not
    // replaced with something off-brand.
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it("leaves a colour alone when it already passes", () => {
    const already = "#7a3d00";
    expect(shiftUntilReadable(already, WHITE)).toBe(already);
  });

  it("lightens instead when the background is dark", () => {
    const onDark = shiftUntilReadable("#333333", "#000000");
    expect(contrastRatio(onDark, "#000000")).toBeGreaterThanOrEqual(4.5);
    expect(luminance(onDark)).toBeGreaterThan(luminance("#333333"));
  });
});

describe("embedTheme", () => {
  it("builds a readable palette from Mango's two colours", () => {
    const t = embedTheme({ accent: MANGO, background: WHITE })!;
    expect(t.background).toBe(WHITE);
    expect(t.accent).toBe(MANGO);
    // Body text and the accent-as-text both clear the bar on their background.
    expect(contrastRatio(t.ink, t.background)).toBeGreaterThan(4.5);
    expect(contrastRatio(t.accentText, t.background)).toBeGreaterThanOrEqual(
      4.5,
    );
    // And text sitting on a brand-coloured fill clears it too.
    expect(contrastRatio(t.accentInk, t.accent)).toBeGreaterThan(4.5);
  });

  it("defaults the background to white when only an accent is given", () => {
    expect(embedTheme({ accent: MANGO })?.background).toBe(WHITE);
  });

  it("returns null when there's no valid accent to theme with", () => {
    expect(embedTheme({})).toBeNull();
    expect(embedTheme({ accent: "chartreuse" })).toBeNull();
  });

  it("falls back to white rather than discarding a valid accent", () => {
    // A mistyped background shouldn't throw away the colour that WAS given
    // correctly — the result is visibly white and obviously fixable, which
    // beats silently serving the default theme.
    const t = embedTheme({ accent: MANGO, background: "javascript:x" })!;
    expect(t).not.toBeNull();
    expect(t.background).toBe(WHITE);
    expect(t.accent).toBe(MANGO);
  });

  it("keeps surface and rule distinguishable from the background", () => {
    const t = embedTheme({ accent: MANGO, background: WHITE })!;
    expect(t.surface).not.toBe(t.background);
    expect(t.rule).not.toBe(t.background);
    // But subtle — a rule shouldn't out-shout the text.
    expect(contrastRatio(t.rule, t.background)).toBeLessThan(4.5);
  });
});

describe("embedThemeVars", () => {
  it("only ever emits hex colours", () => {
    const t = embedTheme({ accent: MANGO, background: WHITE })!;
    for (const value of Object.values(embedThemeVars(t))) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("uses the readable variant where the accent is text, not fill", () => {
    const t = embedTheme({ accent: MANGO, background: WHITE })!;
    const vars = embedThemeVars(t);
    // --claret is the leader's rank number: small text on the page.
    expect(vars["--claret"]).toBe(t.accentText);
    // --primary is a fill, so it keeps the brand colour exactly.
    expect(vars["--primary"]).toBe(MANGO);
  });
});

describe("embedThemeCss", () => {
  /**
   * The bug this exists for. globals.css derives --background, --border,
   * --card and the legacy --surface/--text aliases FROM the raw tokens, at
   * :root. Custom properties substitute where they are DECLARED, so those
   * aliases are fixed to the default palette before any descendant is reached.
   * Setting --paper on a wrapper div moved `bg-paper` and left `bg-background`
   * beige — on the wrapper itself, and on `body`, which is what filled the rest
   * of Mango's 700px iframe. Targeting :root is what makes the override reach
   * the aliases at all.
   */
  it("declares the palette on :root, not on a descendant", () => {
    const t = embedTheme({ accent: MANGO, background: WHITE })!;
    expect(embedThemeCss(t)).toMatch(/^:root\{/);
    expect(embedThemeCss(t)).toMatch(/\}$/);
  });

  it("carries every variable the theme defines", () => {
    const t = embedTheme({ accent: MANGO, background: WHITE })!;
    const css = embedThemeCss(t);
    for (const [name, value] of Object.entries(embedThemeVars(t))) {
      expect(css).toContain(`${name}:${value}`);
    }
  });

  /**
   * It is rendered as the children of a <style> element, so it must contain
   * nothing React would escape — and nothing that could close the element or
   * the rule early. Every value came through parseHexColor, which is what makes
   * that true; this pins it rather than trusting it.
   */
  it("contains nothing but hex colours and its own punctuation", () => {
    const t = embedTheme({ accent: MANGO, background: WHITE })!;
    const css = embedThemeCss(t);
    expect(css).not.toMatch(/[<>&]/);
    // Strip the rule's own braces, then every `--name:#rrggbb` pair. Anything
    // left over would be something we did not intend to emit.
    const inner = css.replace(/^:root\{/, "").replace(/\}$/, "");
    for (const decl of inner.split(";")) {
      expect(decl).toMatch(/^--[a-z0-9-]+:#[0-9a-f]{6}$/);
    }
  });
});
