import { describe, expect, it } from "vitest";

import { leagueAccess } from "@/lib/registration/player-access";

const player = (over: Partial<Parameters<typeof leagueAccess>[0]> = {}) => ({
  userId: "u1",
  hasRosterRow: false,
  freeAgentId: null,
  freeAgentStatus: null,
  ...over,
});

describe("leagueAccess", () => {
  it("is no-account without an account, however they were added", () => {
    expect(leagueAccess(player({ userId: null }))).toBe("no-account");
    // Even placed on a team with a sign-up: no account is no sign-in.
    expect(
      leagueAccess(
        player({ userId: null, freeAgentId: "fa1", freeAgentStatus: "placed" }),
      ),
    ).toBe("no-account");
  });

  it("can see it with a roster row — what my_competitions reads", () => {
    expect(leagueAccess(player({ hasRosterRow: true }))).toBe("can-see");
  });

  it("can see it while waiting in the pool", () => {
    // my_pool_signups (0132) shows these as "Waiting to be placed".
    expect(
      leagueAccess(
        player({ freeAgentId: "fa1", freeAgentStatus: "available" }),
      ),
    ).toBe("can-see");
    expect(
      leagueAccess(
        player({ freeAgentId: "fa1", freeAgentStatus: "pending_payment" }),
      ),
    ).toBe("can-see");
  });

  /**
   * The case this exists for. Placed on a team, has an account, but
   * `place_free_agents` never wrote a roster row because they had no account at
   * the time. my_competitions misses them (no team_members row) and
   * my_pool_signups misses them (not 'available'), so they see nothing.
   */
  it("flags a placed player with an account and no roster row", () => {
    expect(
      leagueAccess(player({ freeAgentId: "fa1", freeAgentStatus: "placed" })),
    ).toBe("no-access");
  });

  it("flags an account with no link to the league at all", () => {
    expect(leagueAccess(player())).toBe("no-access");
  });

  it("prefers the roster row over the sign-up status", () => {
    // Both linked: the roster row is what actually makes it visible.
    expect(
      leagueAccess(
        player({
          hasRosterRow: true,
          freeAgentId: "fa1",
          freeAgentStatus: "placed",
        }),
      ),
    ).toBe("can-see");
  });
});
