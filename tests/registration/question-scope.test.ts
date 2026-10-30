import { describe, expect, it } from "vitest";

import { kindAllowedForScope } from "@/lib/registration/question-scope";

describe("kindAllowedForScope", () => {
  it("lets a player question ask for contact details", () => {
    expect(kindAllowedForScope("player", "email")).toBe(true);
    expect(kindAllowedForScope("player", "phone")).toBe(true);
    expect(kindAllowedForScope("player", "address")).toBe(true);
  });

  it("refuses contact details on a team question, which the roster can read", () => {
    expect(kindAllowedForScope("team", "email")).toBe(false);
    expect(kindAllowedForScope("team", "phone")).toBe(false);
    expect(kindAllowedForScope("team", "address")).toBe(false);
  });

  it("allows every other kind on a team question", () => {
    for (const k of ["short_text", "long_text", "select", "yes_no"] as const)
      expect(kindAllowedForScope("team", k)).toBe(true);
  });
});
