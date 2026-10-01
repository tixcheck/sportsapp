import { describe, expect, it } from "vitest";

import { orgPageCss } from "@/lib/branding/page-theme";

describe("orgPageCss", () => {
  it("is null without a brand", () => {
    expect(orgPageCss({})).toBeNull();
    expect(orgPageCss({ background: "#fbf0f6" })).toBeNull();
  });

  it("an accent alone: white page, flat, cards follow the page", () => {
    const css = orgPageCss({ accent: "#c04890" })!;
    expect(css).toContain("--primary:#c04890");
    expect(css).not.toContain("--paper-raised:#ffffff}");
    expect(css).not.toContain("linear-gradient");
  });

  it("a light tint gets white cards", () => {
    const css = orgPageCss({ accent: "#c04890", background: "#fbf0f6" })!;
    expect(css).toContain("--paper:#fbf0f6");
    expect(css).toContain(":root{--paper-raised:#ffffff}");
    expect(css).not.toContain("linear-gradient");
  });

  it("a second colour washes the page from accent to it", () => {
    const css = orgPageCss({
      accent: "#c04890",
      background: "#fdf7fb",
      secondary: "#48c0c0",
    })!;
    expect(css).toMatch(
      /body\{min-height:100vh;background-repeat:no-repeat;background-image:linear-gradient\(180deg,#[0-9a-f]{6} 0%,#fdf7fb 45%,#[0-9a-f]{6} 100%\)\}/,
    );
    expect(css).toContain(":root{--paper-raised:#ffffff}");
  });

  it("a dark page gets neither white cards nor a wash", () => {
    const css = orgPageCss({
      accent: "#f07848",
      background: "#0f1a2b",
      secondary: "#48c0c0",
    })!;
    expect(css).not.toContain("--paper-raised:#ffffff}");
    expect(css).not.toContain("linear-gradient");
  });

  it("a malformed second colour is ignored, not written", () => {
    const css = orgPageCss({
      accent: "#c04890",
      secondary: "red}body{display:none",
    })!;
    expect(css).not.toContain("display:none");
    expect(css).not.toContain("linear-gradient");
  });
});
