import { describe, expect, it } from "vitest";

import { captainTodos, type CaptainTodoInput } from "@/lib/teams/captain-todos";

const base: CaptainTodoInput = {
  teamStatus: "active",
  roster: [
    { userId: "u1", name: "Sarah" },
    { userId: "u2", name: "Haya" },
  ],
  waiverSigned: ["u1", "u2"],
  minRoster: 2,
  invites: [],
};

describe("captainTodos", () => {
  it("is empty for a complete, signed, paid team", () => {
    expect(captainTodos(base)).toEqual([]);
  });

  it("names who hasn't signed the waiver", () => {
    const t = captainTodos({ ...base, waiverSigned: ["u1"] });
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ kind: "waiver", names: ["Haya"] });
    expect(t[0].text).toMatch(/^1 player hasn't signed/);
  });

  it("ignores waivers when the league has none", () => {
    expect(captainTodos({ ...base, waiverSigned: null })).toEqual([]);
  });

  it("counts players still needed against the minimum", () => {
    const [t] = captainTodos({ ...base, minRoster: 6 });
    expect(t.kind).toBe("players");
    expect(t.text).toMatch(/^4 more players needed \(2 of 6 joined\)/);
  });

  it("splits expired invites from ones still waiting", () => {
    const t = captainTodos({
      ...base,
      invites: [
        { name: "Jo", email: "jo@x.ca", expired: true },
        { name: null, email: "kim@x.ca", expired: false },
        { name: "Lee", email: "lee@x.ca", expired: false },
      ],
    });
    expect(t.map((x) => x.kind)).toEqual(["expired", "invited"]);
    expect(t[0]).toMatchObject({ names: ["Jo"] });
    expect(t[1]).toMatchObject({ names: ["kim@x.ca", "Lee"] });
    expect(t[1].text).toMatch(/^2 players are invited/);
  });

  it("puts an unpaid fee first", () => {
    const t = captainTodos({
      ...base,
      teamStatus: "pending_payment",
      waiverSigned: ["u1"],
    });
    expect(t.map((x) => x.kind)).toEqual(["fee", "waiver"]);
  });

  it("asks nothing of a withdrawn team", () => {
    expect(
      captainTodos({ ...base, teamStatus: "withdrawn", minRoster: 6 }),
    ).toEqual([]);
  });
});
