# Ladder league — "tiers that teams move between every week"

> **Status: DESIGN + pure logic built** (captured 2026-08-06). Outside
> `PRD.md` §4 v0 scope, which describes leagues as a pre-generated round robin
> with fixed tiers. Rules are locked. **Slice 2 (the night split) and the
> movement engine exist as tested pure functions** —
> `lib/scheduler/ladder-split.ts` and `lib/scheduler/ladder-movement.ts`. No
> schema, no UI, no DB writes yet.

## What it is

A **box / ladder league**. Teams are split into tiers. Each week a tier plays
among itself, and the night's results move teams between tiers: the bottom
finishers drop, the top finishers of the tier below rise. Over a season a team
settles at the level where it actually belongs.

This is a standard rec format and a good fit for beach 2s, where the current
model — locked into one tier for a whole season — either bores the strong pairs
or buries the weak ones.

## Decisions (locked 2026-08-06)

- **Tier setup:** the organizer sets the **number of tiers** and the **number of
  teams per tier**. Tiers are the existing `divisions` rows (`tier_order`), and
  a team's registration tier becomes its **starting** tier.
- **Weekly volume:** the organizer sets a target **per team per night**, as
  either **total sets** or **total games**. The app divides that into the
  night's pairings as evenly as it can (see "The split" below). This replaces
  the fixed `games_per_week` for ladder leagues.
- **What decides movement:** **that night's results only.** A pure ladder —
  finish bottom tonight, drop tonight. It is the version an organizer can
  explain courtside, which is the standing bar for ranking logic in this app.
- **Final placing:** **where you finish** — final tier, then position within it
  on the last night. The ladder is the ranking; a Tier A team outranks every
  Tier B team regardless of win counts.

## The split — turning "6 sets each" into a night's pairings

With `n` teams in a tier, each team meets the other `n − 1`. Given a target `T`
sets (or games) per team:

- **`T` divisible by `n − 1`** → every pairing plays `T / (n − 1)`. The owner's
  example: 3 teams, 6 sets → 1v2, 2v3, 3v1 at **3 sets each**, 9 on the night.
- **Not divisible** → still usually solvable, just not uniformly. 4 teams at 4
  sets: one pairing plays 2, the rest play 1, and every team still lands on
  exactly 4. Formally it's assigning a set-count to each edge of the complete
  graph so every vertex's degree hits `T` — a small, pure, very testable
  problem.
- **`n × T` odd** → exactly equal is *impossible* (the total team-sets is odd).
  3 teams × 5 sets = 15. Best achievable is 5/5/4. The app must pick who is
  short, **rotate that across weeks**, and say so in the UI rather than quietly
  shorting the same team every time.

Two things the split must also respect:

- **Court/time capacity.** Total sets on the night has to fit
  `courts × slot length` at the league's `minutes_per_game`. 3 teams at 6 sets
  is 9 sets — on one court that is a long night. Validate at configuration time
  and show the projected finish, don't discover it on the night.
- **Tier sizes below 2.** A tier with fewer than 2 teams cannot play.

## The structural consequence — the season can no longer be pre-generated

Today `planTieredLeagueSchedule` generates every tier's full round robin for the
whole season in one pass, and tiers never interact. A ladder cannot work that
way: **week N+1's matchups do not exist until week N's scores are in.**

Generation therefore splits in two:

1. **Season calendar** (up front): dates, times, courts, which tier plays when.
   Shareable and printable as it is today.
2. **Weekly draw** (after each week): lock the week's results → apply movement →
   draw next week's pairings.

Player-visible effects that need deciding as the UI is built:

- The schedule shows your night/time/court for the season but opponents only for
  the current week. The invite email and weekly digest both assume opponents are
  known in advance.
- `matches.round` still numbers the weeks, so the by-round schedule view works.
- Standings pages need a per-week, per-tier table plus a **ladder history**
  ("which tier were you in each week") — a season-long win table is misleading
  when a team has moved.

## Movement — per-tier counts, decided 2026-08-06

**The organizer sets, for each tier, how many teams go down and how many go
up.** Not per boundary, not forced to match — per tier, independently.

Tiers do **not** need to be the same size. The owner's worked example, 5/6/5:

| Tier | Size | Down | Up | Net |
|---|---|---|---|---|
| Tier 1 | 5 | 1 | — (top tier) | −1 +1 = **5** |
| Tier 2 | 6 | 1 | 1 | +1 −1 −1 +1 = **6** |
| Tier 3 | 5 | — (bottom) | 1 | +1 −1 = **5** |

Sizes hold because the counts happen to match **at each boundary** (T1 down 1 ↔
T2 up 1; T2 down 1 ↔ T3 up 1). Uneven tier sizes were never a problem — only
mismatched boundaries are.

**Mismatched boundaries are allowed, and they drift.** The owner's second
example — Tier 2 sends 2 down but Tier 3 sends only 1 up — shrinks Tier 2 by one
team per week and grows Tier 3 by one. This is intended behaviour, not a bug to
prevent, so the app **guards rather than blocks**:

- **Show the drift before the season starts.** Configuration projects tier sizes
  forward week by week and shows the organizer where they land. A collapse is
  obvious at setup, not in week six.
- **Hard floor: a tier never drops below 2 teams.** A move that would empty a
  tier is refused for that week and reported, not silently applied.
- **Ceiling from court capacity.** With target `T` per team, a tier of `n` plays
  `n × T / 2` sets on the night. A tier growing 5 → 8 goes from 15 to 24 sets at
  T=6. When a tier outgrows its slot, warn the organizer with the projected
  finish time.
- Top tier has no "up", bottom tier has no "down" — forced to 0 in the UI.

## Also unresolved

- **Ties for the last promotion/relegation spot.** Reuse the league's configured
  tiebreaker (`league_settings.tiebreaker`, PRD §8) with the owner's rule that
  head-to-head comes last. Confirm before building.
- **Mid-season joiners / dropouts.** A team leaving Tier B breaks that week's
  movement math. Likely: organizer places a joiner into a tier by hand, and a
  dropout is backfilled by the movement rules the following week.
- **Playoffs.** `LeaguePlayoffPanel` seeds a bracket from final standings. For a
  ladder, "final standings" is the last night's ladder — decide whether playoffs
  seed from the top tier only, or across all tiers.
- **Prime courts.** Tiers rotate courts weekly; the prime-fairness ledger
  (`lib/scheduler/court-assign.ts`) is per-team and should carry across tier
  moves. Worth checking it still balances when a team changes tier.

## Prerequisites in the app

- `league_settings.promotion_relegation` **already exists** — declared in the
  schema and PRD §"league_settings", written `false` on create, and **never read
  anywhere**. A dead flag with the right name; the ladder can adopt it (or
  replace it with a richer `ladder_config` jsonb).
- Tiers already exist as `divisions` + `tier_order`, with organizer management
  (`manage-tiers-dialog.tsx`) and tier choice at registration.
- Movement needs a per-week record of which tier a team was in — a new table
  (`ladder_placements`: competition, team, week/round, division) so history is
  reconstructible and the ladder view is cheap to render.

## Build order (once the open decision closes)

- **Slice 1 — configuration:** ladder on/off, tiers + sizes, per-boundary
  movement counts, weekly volume (sets vs games, and the number). Validation:
  capacity per night, tier size ≥ 2, and the `n × T` odd warning.
- **Slice 2 — the split, as pure logic:** target → pairings → sets per pairing,
  with the rotation rule for who is short. Full unit tests per CLAUDE.md
  (`tests/scheduler/`) — odd counts, 3-team tiers, indivisible targets, the
  impossible-equal case.
- **Slice 3 — weekly cycle:** generate week 1, lock a week, apply movement,
  draw the next week. Includes the ladder-history table and an undo path for an
  organizer who locks a week too early.
- **Slice 4 — surfaces:** per-week tier tables, ladder history/trajectory view,
  public page, digest and invite copy that admits opponents are known only a
  week ahead.
