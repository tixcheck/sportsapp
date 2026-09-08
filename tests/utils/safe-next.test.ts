import { describe, expect, it } from "vitest";

import { safeNext } from "@/lib/utils/safe-next";

/** A literal backslash, spelled out so the source stays escape-free. */
const BS = String.fromCharCode(92);

describe("safeNext", () => {
  it("keeps an ordinary in-app path", () => {
    expect(safeNext("/register/bvl-6s")).toBe("/register/bvl-6s");
  });

  it("keeps the query string, which is where kind=team lives", () => {
    expect(safeNext("/register/bvl-6s/paid?kind=team")).toBe(
      "/register/bvl-6s/paid?kind=team",
    );
  });

  it("falls back when there is nothing to go back to", () => {
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
  });

  it("honours a caller-supplied fallback", () => {
    expect(safeNext(null, "/login")).toBe("/login");
  });

  it("rejects an absolute URL to another site", () => {
    expect(safeNext("https://evil.example/harvest")).toBe("/dashboard");
  });

  // The whole reason this helper exists: startsWith("/") says yes to this one,
  // and the browser then treats it as a different host entirely.
  it("rejects a protocol-relative URL", () => {
    expect(safeNext("//evil.example/harvest")).toBe("/dashboard");
  });

  it("rejects the backslash forms browsers fold into slashes", () => {
    expect(safeNext("/" + BS + "evil.example")).toBe("/dashboard");
  });

  it("rejects a control character that could split a Location header", () => {
    expect(
      safeNext("/dashboard" + String.fromCharCode(10) + "Set-Cookie: a=b"),
    ).toBe("/dashboard");
  });

  it("rejects a scheme that is not a path at all", () => {
    expect(safeNext("javascript:alert(1)")).toBe("/dashboard");
  });
});
