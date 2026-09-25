# HANDOFF — volleyball-platform

> Cross-machine continuity note. Claude Code chat history lives **locally per
> machine** and does NOT travel with the repo, so this file is the bridge.
> **To resume on a new machine:** start Claude Code in the project root and say
> _"read HANDOFF.md, CLAUDE.md, and PRD.md to catch up."_

---

## Current state (last session — 2026-09-13)

- **Branch:** `main`. **Latest commit:** `b199408` — regular weeks are 4 or 6; 5 and 7 are the gym-cancellation case. Pushed, working tree clean, no unmerged feature branches, deployed to Production.
- **GitHub:** `https://github.com/tixcheck/sportsapp.git`
- **Vercel project:** `my-sports-app/sportsapp` (auto-deploys on push to `main`; the GitHub commit status is the deploy signal).
- **Supabase project:** `evngfeuqyllfwkdvsrsb`. **Migrations written through `0133`, and every one of `0060`–`0133` verified as applied against the live database** (`0060`–`0116` audited 2026-09-08 by parsing each migration's DDL and checking the objects exist — not by trusting this file; `0117`–`0118` applied and verified the same way on 2026-09-13, `0119` and `0120` on 2026-09-14, `0121` on 2026-09-15, `0122`, `0123`, `0124` and `0125` on 2026-09-16; `0126` and `0127` on 2026-09-21 — `0127` applied that day, `0126` re-checked against the live column and constraint rather than assumed from the commit; `0128` applied and verified 2026-09-24; `0129`–`0133` all applied and verified 2026-09-25). From `0050` on they are **hand-written SQL** applied with a throwaway node script (drizzle-kit won't run them), so Drizzle's tracking doesn't know about any of them — see Known quirks.
  - **`0074`–`0116` ARE applied** — audited 2026-09-08 against the live
    database. Rather than trusting the record below, a throwaway script parsed
    every migration from `0074` on for the objects it creates (columns, tables,
    indexes, functions) and checked each one exists. Every object is present.
    In date order:

    | Range | Date | What it added |
    |---|---|---|
    | `0074`–`0078` | Aug 14–19 | competition blurb, softball, individual sign-ups + their payments, public player names |
    | `0079`–`0083` | Aug 21 | e-transfer payments, per-tier registration caps, the waitlist (table + functions) |
    | `0084`–`0086` | Aug 25–26 | platform counts, a match audit that outlives what it audits, restore points |
    | `0087`–`0095` | Aug 27 | event images, `can_manage_org`, appearances, organizer-added individuals, pairing order, draft rank, 3rd place, last-match lookup |
    | `0096`–`0099` | Aug 28–30 | Reverse Pairs (+ its registration), the platform-fee waiver, placement track |
    | `0100`–`0101` | Aug 31–Sep 1 | waivers, and the pending-waiver gate |
    | `0102`–`0113` | Sep 7 | PayPal + offline individual payments, registration questions, individual caps, suggested answers, waiver initials, unique team names, address questions, home locality (competition then org), answer-upsert inference, confirmed reference |
    | `0114`–`0116` | Sep 8 | one team per captain, per-tier ladder weights, `hidden_from_discovery` |
    | `0117`–`0118` | Sep 13 | ladder night results typed directly, printed-sheet notes + named officials |
    | `0119` | Sep 14 | dismiss an uncompleted offline payment request; withdrawal cancels open ones |
    | `0120` | Sep 14 | drafted free agents count as players in `competition_player_names` |
    | `0121` | Sep 15 | `league_settings.session_nights`; `match_absences` (organizer-only) for the Missed stat |
    | `0122` | Sep 16 | `unconfirm_offline_payment` — undo an offline payment confirmed by mistake |
    | `0123` | Sep 16 | `matches.division_id`; `place_bracket_winner` scoped by division (and track) |
    | `0124` | Sep 16 | `competitions.teams_referee` — off frees the scheduler to pack games onto every court |
    | `0125` | Sep 16 | playoff format saved per competition: `playoff_advance_mode`, `playoff_third_place`, `playoff_courts` |
    | `0126` | Sep 17 | `league_settings.ladder_scoring` — `placement` scores lowest-wins (Mango Fall, the only league on it); every other league stays `points` |
    | `0127` | Sep 21 | `removed_signups` + `remove_free_agent()` — a deleted individual sign-up now leaves a snapshot and an editable note instead of vanishing |
    | `0128` | Sep 24 | `venues.courts` — how many courts a gym has, recorded once on the building instead of per league |
    | `0129` | Sep 25 | `organizer_add_individual` stores NULL, not `''`, for a missing email — it had never been able to add a player without one |
    | `0130` | Sep 25 | `free_agents.is_captain`, `claim_free_agent_signups()` (adopt a sign-up when its person makes an account), `draft_pool()` (what a captain may read) |
    | `0131` | Sep 25 | adopting a sign-up JOINS THE ROSTER too — `my_competitions` reads only `team_members`, so 0130's linking alone still showed a drafted player nothing |
    | `0132` | Sep 25 | `my_pool_signups()` — "you're in the pool for this league" on the dashboard, for somebody signed up but not yet drafted |
    | `0133` | Sep 25 | `reverse_pairs_settings.point_cap` — most one game may swing the standings. Null = uncapped, so every night already played scores as before |

    **Two things will look like gaps in a future audit and are not:**
    - `0079`'s `registration_payments_one_open_etransfer` index is **gone on
      purpose** — `0102` drops it and replaces it with
      `registration_payments_one_open_offline`, which is strictly broader
      (`method <> 'card'` rather than `method = 'etransfer'`), so the
      one-open-charge-per-team rule is still enforced, under a new name.
    - `0075` (softball) and `0109` (address question kind) create no tables,
      columns or indexes — they are function/DML only, so an
      object-existence audit has nothing to find in them.

  - **`0073` (per-tier ladder) IS applied** — 2026-08-14. `divisions` gains
    `ladder_target`, `minutes_per_set`, `start_time`, `late_start_slots`. Null =
    use the league's value, so existing ladders are untouched. Built for the
    Mango Sports ladder, whose two tiers run different targets, set lengths,
    start times AND courts.
    - **`lib/scheduler/ladder-night.ts`** orders one tier's sets on its own
      court: max 2 sets in a row, no back-to-back rematches, and a late-arriving
      top team that still gets breaks.
    - **A late start held as long as arithmetically possible is a trap** — the
      top team then plays every remaining slot consecutively. There's a test
      asserting exactly that, so nobody "fixes" it back.
    - **`drawLadderWeekAction` has NOT been taught these columns yet.** It still
      reads the league-wide values and packs tiers into shared waves. Mango's
      week 1 was written directly; weeks 2-5 need the draw action updated.
  - **Auto venue assignment** (no migration) — `lib/scheduler/venue-assign.ts`
    packs divisions into gyms and rotates who gets the early block, seeded from
    the games already played. Surfaced as an **Auto-assign** button that fills
    the selects and saves nothing.
    - **Start slots are restricted to ANCHORS** (slot 0, or where a gym frees
      up). Allowing any start strands capacity — a 3-round block at slot 1 of a
      6-slot gym leaves unusable 1- and 2-slot gaps — and left two real BVL
      divisions unplaced while five gyms sat half empty.
    - **Lateness drives the placement ORDER, not just the cost.** Whoever is
      placed first takes the best slot, so weighting it only inside the cost
      function achieves nothing.
  - **`0072` (division venues) IS applied** — 2026-08-13. `divisions.venue_id`,
    plus per-venue start times carried on `weekly_slots` (jsonb, no DDL). The
    generator now groups court assignment BY VENUE — without it a six-gym night
    draws court numbers from one pool and double-books a physical court. Passing
    no venues preserves the old behaviour exactly.
    - `planTieredLeagueSchedule` also returns `overCapacity`: venues asked to
      host more simultaneous games than they have courts. It still emits a
      schedule (wrapping court numbers, as always) — the report is what lets the
      caller warn instead of silently double-booking a gym.
    - **`lib/scheduler/venue-conflicts.ts`** audits any schedule, including
      imported ones. **Its split-division check is scoped to ONE NIGHT on
      purpose** — BVL rotates gyms week to week, and a season-wide comparison
      flagged five well-run divisions as broken.
  - **`0071` (venues) IS applied** — 2026-08-13. A `venues` table scoped to the
    ORG (name, address, entry_notes, doors_note), plus `matches.venue_id` and a
    `venueId` on each `LeagueCourt`. Org-scoped on purpose: the same gyms come
    back every season, and BVL's Terry Miller is now one row shared by two
    leagues.
  - **`0128` adds `venues.courts`** — 2026-09-24. How many courts the building
    has, typed once on the venue instead of per league. **Nullable**: null means
    "not stated" (all 26 venues on the day it shipped), and a league keeps
    falling back to its own count. Never make it `not null default 1` — the
    generator believes what it is told and would silently wrap court numbers.
    It is a DEFAULT, not an override: a league's own `court_list` still wins,
    because an org with a four-court gym may use two of them on a Tuesday.
    - **⚠️ Leagues do NOT read it yet.** The seam is `venueCourts` in
      `server/actions/leagues.ts` (~807), a map of venue → court LABELS that
      `labelFor` indexes into. Seeding it from a bare count means generating
      labels, and whether those are "1".."4", letters, or copied from a sibling
      league is the organizer's vocabulary — deliberately left undecided.
      Until that is wired, entering a court count on a venue changes nothing
      about generation; it is a record, and it prefills nothing.
    - **Court labels are NOT unique across venues.** Every school gym has a
      "Court A". Court identity is `(venue, label)` — never the label alone.
      Anything comparing courts by label is a latent bug; `sameCourtRef` in
      `lib/venues/resolve.ts` is the correct comparison.
    - The By-court schedule view had exactly that bug and is fixed.
    - `on delete set null`, so removing a venue never deletes its games.
    - Slice two (`0072`) removed the single-venue limits noted here.
  - **`0070` (organizer payment management) IS applied** — 2026-08-13. Adds
    refund state to `registration_payments` (`refunded_cents`,
    `stripe_refund_id`, `refunded_at`, `refund_reason`) with two check
    constraints, the admit-unpaid trail on `teams`, and the SECURITY DEFINER
    functions `admit_team_unpaid` and `organizer_register_team`. Verified in
    rolled-back transactions (21 checks): both constraints refuse what they
    should; `admit_team_unpaid` refuses an anonymous caller, stamps who/when/why,
    and is a no-op on an already-active team; `organizer_register_team` refuses a
    non-admin, makes the first listed existing user the captain immediately,
    leaves an account-less invitee pending, and still hits the capacity cap.
    - **Refunds are recorded PRO RATA and only by the webhook.** The organizer's
      action calls Stripe; `charge.refunded` writes the row. `amount_refunded`
      is cumulative, so storing it directly is idempotent.
    - **A refund does NOT demote a confirmed team.** Deliberate — mid-season that
      would pull them out of pools, schedules and standings.
    - **Admitting a team unpaid does NOT clear its debt.** The balance keeps
      showing on the dashboard. Two decisions, not one.
  - **`0069` (per-kind unsubscribe) IS applied** — 2026-08-12. `unsubscribe(_token)` only ever set `notify_weekly`, so every new opt-out-able email pointed at a link that switched off the digest and kept sending what the reader objected to. Now `unsubscribe(_token, _kind)` maps weekly/results/schedule/org_messages/all to the right column; an unknown kind falls back to the digest. **The 1-arg signature was DROPPED** (same ambiguity rule as `register_team`); verified the legacy 1-arg call still resolves. Email footers must now pass `?kind=` — a footer without one silently unsubscribes from the digest instead.
  - **`0068` (organizer broadcasts) IS applied** — 2026-08-12. Adds `users.notify_org_messages` (default true) and the `org_messages` audit table. The log stores a recipient COUNT, never the address list — the addresses are already in `users` and copying them spreads PII for no gain.
  - **`0067` (payment attribution) IS applied** — 2026-08-12. `payer_user_id` existed since `0064` but was never populated, so “my payments” could only match on email — and a `team_full` charge carries no payer email at all. `start_registration_payment` now sets it from `auth.uid()`: a parameter could be forged, and the settling webhook has no user context, so the SECURITY DEFINER function is the only trustworthy place. Body is the `0064` definition verbatim plus the attribution update.
  - **`0066` (payment-gated registration) IS applied** — 2026-08-12. Adds `pending_payment` to `team_status`, `teams.payment_mode`, and makes `register_team` admit a team as `pending_payment` when the event has a fee AND `payment_required`. **Two transactions**: a new enum value is unusable until its own transaction commits. **The 4-arg `register_team` was DROPPED** — a 4-arg and a 5-arg-with-default overload make every existing call ambiguous (“function is not unique”). Verified a 4-named-arg PostgREST-style call still resolves, so deployed callers were never broken. Verified all four gate cases in rolled-back transactions: free → active; priced but not required → active; priced + required → `pending_payment` with the captain's mode recorded.
    - **App-side exclusions matter more than the migration.** 8 team queries now filter `pending_payment` (pools, league schedule, brackets, standings, and the tournament/league schedule + pool views); kotc already filtered to `active`. Organizer team lists and the dashboard deliberately still show pending teams — that is how you chase them. If you add a new query that selects teams for PLAY, it must exclude `pending_payment`.
  - **`0065` (max teams) IS applied** — 2026-08-12. Adds nullable `max_teams` to `tournament_settings` and `league_settings` (null = uncapped, which every existing competition is), and re-declares `register_team` with a capacity guard. The function body is the `0058` definition VERBATIM plus the guard — reproduced, not rewritten, so invites/division validation/display-name seeding are untouched. Counting happens INSIDE the SECURITY DEFINER function that inserts, so two captains racing for the last spot cannot both get in; withdrawn teams free their spot. Verified against a real 12-team tournament in rolled-back transactions: capped at 12 → refused with “all 12 spots have been taken”; capped at 13 → registration succeeded (which also proves the copied body still works).
  - **`0064` (registration payments) IS applied** — 2026-08-12. Additive: the `registration_payments` table (20 columns), 2 enums, 6 indexes (including two PARTIAL unique indexes that permit only one *open* charge per payer, which is what stops a double-clicked “Pay now” billing twice), 4 check constraints, one SELECT policy, and the SECURITY DEFINER functions `start_registration_payment` / `cancel_registration_payment`. Verified the `total_balances` check by attempting an unbalanced insert — refused. Table starts empty.
  - **`0063` (registration fees) IS applied** — 2026-08-12. Additive: `platform_fee_settings` (singleton row, seeded 1% / $3 / $20) and `competition_payment_settings`. Both RLS-enabled with select + admin-write policies. Verified: the singleton check refuses a second rates row, and the `mode_required` check refuses a priced event with both payment modes off. `competition_payment_settings` starts empty — rows are created lazily when an organizer first sets a price.
  - **`0062` (invite expiry) IS applied** — 2026-08-11. Replaces three functions only, no data change. Verified: `accept_pending_invites` and `autolink_team_invites` no longer reference `expires_at`; `claim_team` still does, guarding a token whose email doesn't match the caller. Proven end-to-end by impersonating a real locked-out captain in a rolled-back transaction (invite expired Jul 19 → accepted, roster row created, then rolled back).
  - **`0061` (ladder format) IS applied** — 2026-08-06, verified: 4 columns on `league_settings`, the `ladder_placements` table, both RLS policies, and both check constraints live. All 3 existing leagues picked up the defaults (`ladder_enabled = false`), so nothing changed for them.
  - **`0060` (payment_accounts) IS applied** — 2026-08-12, on the owner's go once Stripe test keys landed. Purely additive: the `payment_accounts` table (14 columns), the `(org_id, livemode)` unique constraint, `payment_accounts_org_id_idx`, RLS on with the single SELECT policy, and `link_payment_account` (SECURITY DEFINER). No existing data touched; table starts empty. Verified by impersonating a real org owner in a rolled-back transaction: first call inserted, second call returned the SAME id while ignoring the second account (the idempotency the onboarding action depends on), RLS let that admin read the row, and an `anon` caller was refused — then rolled back to 0 rows.
    - Note: Postgres grants EXECUTE on functions to `PUBLIC` by default, so `anon` holds EXECUTE on `link_payment_account`. Harmless — the function's own `is_org_admin` check raises for a caller with no `auth.uid()` (proven above) — but a `revoke execute ... from public, anon` would be tidier defense in depth.
  - For `0050`–`0059`, **confirm with the owner before assuming.**
- **Tests:** `npm test` → **824 passing across 68 files** (verified 2026-08-14). tsc, eslint, prettier and `next build` clean.
  - **Build gotcha:** `next build` intermittently dies with `EINVAL: invalid argument, readlink .next/server/functions-config-manifest.json`. That's OneDrive syncing the `.next` directory, not a code error — `rm -rf .next` and rebuild.
- **In flight:** registration **payments** (Stripe Connect) — decisions locked
  2026-07-30, plan at `docs/plans/registration-payments.md`.
  - **Slice A (payouts onboarding) is SHIPPED and verified in production**
    (2026-08-12). Stripe test keys live in `.env.local` and Vercel; `stripe`
    SDK v22.5.0 added; migration `0060` applied. Proven end-to-end against a
    real Express account: 10 `account.updated` deliveries tracked, DB flags an
    exact match for Stripe's account object, `onboarded_at` stamped.
  - **Slice B (paid registration) is SHIPPED** (2026-08-12) — all three
    sub-slices: B1 fee-at-the-event (`0063`), B2 Checkout with destination
    charges (`0064`), B3 split payments. Plus payment-gated registration
    (`0066`), max-teams caps (`0065`), payer attribution (`0067`), and the
    `/profile/payments` page. See `PROGRESS.md` for the detail.
  - **Slice C (organizer payment management) is COMPLETE** (2026-08-13):
    partial-payment approval, organizer-registered teams + payment links,
    refunds, the payments dashboard, receipt/refund/request emails — plus the
    captain's **"cover the rest"** and the organizer's **"refund all payers"**,
    which finish the split-payment story the plan asks for. See `PROGRESS.md`.
    **Not verified against real Stripe money yet** — the refund path has unit
    tests and rolled-back DB checks but no live test-mode refund has been run
    end to end. That is the one thing to do before trusting it.
  - **Not yet done for go-live:** live Stripe keys, real (non-test) onboarding,
    and TOS / refund / surcharge disclosure copy.
  - **Gotcha, cost an hour:** the canonical domain is `www.mysportsapp.ca`.
    The apex `mysportsapp.ca` 308-redirects, and **Stripe treats a 3xx on a
    webhook as a failed delivery** — it does not follow redirects. Any Stripe
    event destination must use the `www` URL. Note `lib/utils/url.ts`
    `CANONICAL_URL` is still the apex; harmless for browsers/email (they follow
    redirects), fatal for webhooks.
  - **Connect webhooks must be scoped to "Events on connected accounts."**
    `account.updated` for an Express account never reaches an endpoint listening
    only to your own account's events — and it fails silently.
  - **Connected-account events don't appear in the platform's event list.**
    `stripe.events.list()` returns nothing; you need
    `stripe.events.list({...}, { stripeAccount: acct_... })`. Easy to mistake
    for "the webhook never fired".
  - **Express accounts are `requirement_collection: stripe`.** The platform
    cannot write `individual.*` — `accounts.update` returns
    `StripePermissionError`. Outstanding requirements can only be cleared
    through Stripe's hosted flow. Test account `acct_1U3ewF2Xcj6rCnzd` sits at
    `charges_enabled = true`, `payouts_enabled = false`, blocked on
    `individual.verification.proof_of_liveness` — which gates payouts, not
    charges, so it does not block Slice B.

## ⚠️ Critical for the live tournament

- **DO NOT regenerate pools on the live tournament.** It discards the pool
  schedule (times/courts and any scores) **and moves the announced game-1
  times**. Safe alternatives: edit a single match's time/court (reschedule
  dialog), or **"Rebalance refs"** (changes referees only — never pairings,
  times, courts, or scores).
- **Pool game reorder for even wait times** was investigated and **NOT built**.
  Finding: 4-team pools are already mathematically optimal (one team always gets
  a back-to-back + a long wait — unavoidable); 5/6-team pools could benefit from
  a non-destructive reorder. Pending tomorrow's event feedback before building.

## Embedding a league on someone else's site

Two chrome-free pages an organizer's web developer drops into an iframe. No
keys, no CORS, no account — visibility is RLS's decision, so a private or draft
league 404s here exactly as it does on the public page.

    https://www.mysportsapp.ca/embed/l/<slug>/schedule
    https://www.mysportsapp.ca/embed/l/<slug>/standings

Both take two optional query params so the embed can match the host's branding:

| param | meaning |
| --- | --- |
| `accent` | brand colour, hex with or without `#` |
| `bg` | page background; defaults to white |

Anything that isn't provably a hex triple is **discarded**, not sanitised — the
value goes into CSS from a public URL, and there is no such thing as a nearly
valid colour. A typo degrades to our default palette rather than breaking.

The accent is used two ways, because a brand colour is not automatically a
readable one: exactly as given where it FILLS a shape (with text chosen to sit
on it), and darkened until it passes 4.5:1 where it has to BE text. Mango's
`#feb62a` is 1.9:1 on white, so substituting it directly would have produced a
standings table nobody could read. See `lib/embed/theme.ts`.

**Gotcha:** the theme is applied in the embed PAGES, not the layout. App Router
layouts don't receive `searchParams`; `tsc` won't tell you, and the symptom is
params that are silently ignored.

**Gotcha, and the reason `bg` looked broken until 2026-09-21:** the palette must
be declared on **`:root`** (`embedThemeCss`), never as a `style` attribute on a
wrapper. `globals.css` derives `--background`, `--border`, `--card`,
`--foreground` and the legacy `--surface`/`--text` aliases FROM the raw tokens,
at `:root`, and custom properties substitute where they are DECLARED — so those
aliases are already fixed to the default palette before any descendant is
reached. Overriding `--paper` on a wrapper moved `bg-paper` and left
`bg-background` beige, on the wrapper AND on `body` (which carries
`bg-background` from `@layer base`) — the latter filling whatever the content
did not, inside a fixed-height iframe. Mango's developer saw exactly that and
reasonably concluded the parameter did not exist. It did; it just could not
reach the thing painting the page.

The embed posts its height to the parent (`{ type: "mysportsapp:height" }`) so a
host that wants auto-sizing can listen; one that doesn't is unaffected.

**Live example:** mangosportsco.ca embeds `mango-ladder-fall-2026` with
`?accent=feb62a&bg=ffffff`.

## What shipped recently (newest first)

- **Scarborough Men's format** (migrations `0117` + `0118`) — pinned pod grids
  as data, golf-scored overall standings, the gym-sheet builder, and storage for
  a night's typed result, the printed sheet's instructions and its named
  officials. See the SMVA section below for the traps.
- **Venues** (migration `0071`) — a competition can span several buildings.
  Org-scoped venues, `matches.venue_id`, venue-aware court identity and
  schedule grouping. Built for BVL's indoor season (9 divisions, 6 gyms).
- **Slice C** (migration `0070`) — **organizer payment management**: refunds
  (pro rata, webhook-written), "admit anyway" for part-paid teams, an
  organizer-adds-a-team flow, the payments dashboard on both organizer pages,
  and receipt / refund / payment-request emails.
- `31a5a66` (migrations `0068` + `0069`) — **organizer broadcasts**, plus a
  per-kind unsubscribe. The old `unsubscribe(_token)` only ever switched off the
  weekly digest, so opt-out links kept sending the thing the reader objected to.
  **Email footers must now pass `?kind=`.**
- `9477003` — **missing-score reminder**: a daily cron nudges captains when a
  league game has no score.
- `4a39961` (migration `0067`) — **`/profile/payments`** for players, and
  `payer_user_id` is finally populated (from `auth.uid()`, inside the SECURITY
  DEFINER function — a parameter could be forged).
- `4025db7` — captain **chooses the payment mode at registration**.
- `b34e59c` (migration `0066`) — **payment-gated registration**: the new
  `pending_payment` team status, and 8 team queries that now exclude those teams
  from play. _Any new query that selects teams for PLAY must exclude it too._
- `a97b453` (migration `0065`) — **max teams** cap, counted inside the inserting
  function so a race for the last spot can't over-fill.
- `7c39676` — **tournament wizard restructured**; events are priced at creation.
- `6e59e41` — **split payments** (Slice B3): players pay their own share.
- `f9cddb2` (migration `0064`) — **Checkout with destination charges** (B2).
- `af61c7d` (migration `0063`) — **organizers can set a registration fee** (B1).
- `01fb968` — the UI calls it **"Playoffs"**, not "Bracket" (organizer-facing
  language; the code/engine still says bracket).
- `2fd9f73` — **weekly digest** lists games in day/time order, with the court.
- `5f84162` — schedule: mobile match cards + view switcher no longer overflow.
- `55d44a8` — emails link to the **canonical domain**, not the ephemeral Vercel
  deploy URL.
- `6f7424f` — **standings normalize by scheduled slate**, not games played, so
  mid-season joiners aren't ranked unfairly (owner rule: ranking must stay simple
  enough for an organizer to explain to a player).
- `a26fa64` — dedicated shareable **`/register/<event>` page** (registration
  Slice 3).
- `4975056` (migration `0059`) — organizers can read their own players'
  names/emails (RLS: `administers_team_member`).
- `1e0595b` (migration `0058`) — **player names at registration**.
- `f5e0c63` (migration `0057`) — **public league registration** (Slice 2);
  `register_team` generalized to leagues and now actually invites teammates.
- `e23f47d` — **league tiers** (separate mini-leagues) — Slice 1.
- `37069c0` / `35f72d8` (migration `0056`) — **site reviews**, public + owner-
  moderated, plus discoverability from the user menu and dashboard.
- `5b61397` — players can **enter scores from the public schedule**.
- `6f7424f`-era fixes: org switcher navigates; **head-to-head is the last
  tiebreaker step** (owner rule); tournament + league organizer pages use tabs.
- `853d2d3` — **League playoffs**: seed a single-elim (or Championship +
  Consolation) bracket from final league standings, reusing the tournament
  bracket engine. New `LeaguePlayoffPanel`, public **Playoffs** tab.
  `generateBracketAction` now anchors off the last regular-season match
  (`bracket_position is null`) so it works for leagues (no pools).
- `83f2f3f` — **Games-per-team target** (tournaments): organizer sets a target;
  pools are sized to deliver it (`poolSizesForGames` / `gamesPerTeamRange`,
  migration `0035` adds `tournament_settings.target_games_per_team`).
- `dc69f51` / `de8de1b` — **Edit settings after creation** (edit-until-scores)
  for leagues and tournaments.
- `36647ad` — **Daily event window**: `start_time`/`end_time` on competitions
  (migration `0034`); start seeds the default first-match time.
- `3b2b4d7` — **Slot length derived from match format** (`estimateMatchMinutes`).
- `4d0445f` — stopped sending score emails (result + confirm-request).
- `c4dc706` — **My-team page and `/my-matches` now share one `MatchSections`
  component** (can't drift). Sections: Up Next / Round Robin / Schedule (leagues)
  / Playoff bracket / Reffing.
- `40da17a` — **"Rebalance refs"** button (non-destructive, refs-only) +
  `assignPoolRefs` pure fn.
- `2e3f27a` — playoff projection shows a **rough first-game time estimate**
  (only when pool games have times; clearly a ballpark).
- `fb9f534` — **bracket shows each team's pool record + point ratio** (justifies
  seeds).
- `c0c5afc` — My-matches **Reffing** section; projection card uses **top/bottom
  bracket** language and hides the opponent until the draw.
- `6bbdb8e` — **ref-game count per team** on the Teams card.
- `b0109fe` — **balanced pool ref load** (counts differ by ≤1; reffing-crossover
  kept as the tiebreaker). _Existing tournaments only get the even spread on pool
  regeneration OR via "Rebalance refs"._
- `f315776` / `15bd232` / `362487f` — three-section My-matches + the shared
  **live bracket-preview engine** (`bracketSeedTracks` / `projectBracket` /
  `getBracketPreview`) with a divergence-lock test.
- `3d00592` — invite email **"You're registered for …"** copy with venue/dates;
  removed temporary diagnostics.
- `457f6c8` — **email send fix**: render the React template to HTML in-app
  (resend treats `@react-email/render` as an optional peer and couldn't resolve
  it at runtime — that's why invites silently failed with nothing in Resend's
  logs). Env (`RESEND_API_KEY`, `EMAIL_FROM`) confirmed in Vercel; domain
  `mysportsapp.ca` must stay verified in Resend.
- `c0f2fe9` / `4dd486d` — bracket **courts + estimated times** auto-assigned at
  generation; bracket matches scoreable + editable.
- `0dd5a6d` (migration 0033) — nulled out old auto-applied short-pool ref/format
  overrides.
- `502d6dd` (migration 0032) — fixed the `competitions` SELECT RLS policy
  (self-lookup broke `INSERT … RETURNING`, which is why tournament creation
  failed with "new row violates row-level security policy").
- `16dca6e` — standings **Ratio column shows point ratio (PF/PA)**, not set
  ratio (kills the spurious ∞).

## Open threads / candidate next work

- **Registration payments (Stripe Connect) — the active thread.** Slices A and
  B and C are all shipped. See `docs/plans/registration-payments.md` → "Build
  order". Test keys are in `.env.local` and Vercel. **Remaining before go-live:**
  a real test-mode refund run end to end, live Stripe keys, real (non-test)
  Connect onboarding, and TOS / refund / surcharge disclosure copy.
- **KotC full elimination engine** — plan only, not built
  (`docs/plans/kotc-elimination.md`).
- **AI spreadsheet import** — approved design, parked 2026-06-30
  (`docs/plans/spreadsheet-import.md`).
- **Pool game reorder for even waits** (5/6-team pools) — pending event feedback.
- **Tournament-page projected-bracket panel** — would reuse `getBracketPreview`;
  optional, not built.
- **Organizer (non-member) read-only team view** still uses the flat
  `ScheduleView` (intentional). Could unify with `MatchSections` if wanted.
- Optional **"your schedule is ready" email** when pools are drawn (so captains
  get first-game court/time, which the invite can't include).

## Known data issues — deliberately NOT fixed (owner's call, 2026-08-04)

Run **`npm run check:courts`** to see the current state of all of this. It's
read-only and prints a per-league report. **Re-run it after any scheduling
change** — it's the cheap way to catch drift before players do.

The code bug behind these is fixed (`674e524`): courts now store the bare label
matching `court_list`, and `lib/scheduler/court-label.ts` normalizes everywhere.
**The existing rows were left as they are — the owner chose not to alter live
league data.** Display normalizes, so none of this is visible to players; the
cost is that prime-court *history* stays partly invisible to the balancer.

- **Top Gun Summer 2026** — 12 matches stored as `"Court 10"`, 70 as `"10"`.
  70 matches have **no round number** (created before the 2026-07-19 fix that
  numbered mid-season games; the schedule view synthesizes rounds from start
  times, so they still group sensibly).
- **Top Gun + Summer Sirens** — prime-court spread of **2** (3–5 prime games per
  pair). Ross & Rachel is at 1, which is optimal. The spread came from the
  mid-season balancer failing to read prior prime history across the format
  split, so it restarted from zero.
- **If either league is rebalanced or extended**, the prime ledger will now read
  correctly going forward — but it will NOT retroactively even out games already
  played. Show the owner a projection before writing anything.

The backfill was scoped and declined, not forgotten: normalize `matches.court`
with `regexp_replace(court, '^[Cc]ourt\s+', '')` for league competitions, and
number the null rounds by distinct start time. **Do not run either without the
owner's explicit go.**

## Scarborough Men's (SMVA) — format in, entry UI still to build

**`0117` and `0118` are APPLIED** (2026-09-13, verified object by object).
`0117` adds `result_rank` + `result_points` to `ladder_placements`; `0118` adds
`league_settings.sheet_notes` and the `ladder_night_officials` table. All
nullable or defaulted, so no existing league changes. **Nothing in the app reads
them yet** — the storage landed ahead of the entry UI on purpose, so that UI is
a pure-frontend slice when it comes.

**`lib/db/schema.ts` mirrors both** as of the same day. It had drifted, which is
the standing hazard with hand-written migrations: drizzle-kit never sees them,
so nothing forces the two into agreement.

**Their ladder is ONE linear chain of 8 tiers**, not a branching one. 2A sits
above 2B and 5A above 5B, so `applyLadderMovement` models it directly with no
engine change:

| # | Tier | Gym | Teams |
|---|---|---|---|
| 0 | 1 | Bethune | 6 |
| 1 | 2A | Leacock A | 4 |
| 2 | 2B | Leacock B | 4 |
| 3 | 3 | Agincourt | 6 |
| 4 | 4 | PPL | 6 |
| 5 | 5A | Porter | 4 |
| 6 | 5B | Wexford | 4 |
| 7 | 6 | King | 6 |

`swaps: [2, 2, 2, 2, 2, 2, 2]` — two exchanged at every boundary, which
reproduces every sheet's printed line.

**Their pod grids are DATA, not generated** (`lib/scheduler/pod-templates.ts`).
Same matchups, same courts, same order every week; the organizer was explicit it
"has to be this".

**4 and 6 are the REGULAR sizes; 5 and 7 are the cancellation case.** All four
are pinned, separated by `kind` — 3 courts means 6 teams, 2 courts means 4, and
in a regular week nobody ever sits. The 5- and 7-team grids on the April 13
sheet are from a week where a gym fell through and the tiers were rebalanced, so
they exist for that and are not what a normal week looks like.

**Matches per team is not games per team**, and confusing the two misreads every
sheet. A 4-team night is **3 matches × 3 games** (45-minute clock, 36 total
points); a 6-team night is **5 matches × 2 games** (26-minute clock, 60 points).
Both come to ~150 minutes with nobody sitting — that equivalence is *why* the
clocks are 45 and 26 rather than round numbers, so don't tidy them.

**The 2-points-per-game rule was derived from their printed totals** (60 and 36),
which is what let the 5- and 7-team totals be computed (40, 84) instead of
invented.

**The sheet prints NAMES, not letters** (`lib/scheduler/gym-sheet.ts`). Their
grid says "A vs C" with a legend because nobody can rewrite six team names into
a printed grid by hand every week — the letters are an artefact of paper. They
survive inside the template as the grid's stable shape, get bound to teams in
seeded order, and are never shown. `buildGymSheet` returns **null** for a pod
size with no pinned grid: the gym runs off this sheet, so a missing one beats an
invented one.

**⚠️ `resolveDuty` is only safe on text WE author.** It replaces bare letters,
which is right for a template's "A and B setup courts" and catastrophic for
prose — the organizer's "A 4-minute warning will be given" printed as "VOID
4-minute warning". Organizer-authored text uses `{A}`–`{G}` placeholders and
`resolvePlaceholders` instead. **29 unit tests passed over that bug; rendering
the sample sheet is what caught it** — worth remembering before trusting a green
suite on anything whose output is a printed page.

**`parseSheetNotes` DROPS a malformed block rather than repairing it.** The
destination is a print layout, where a titled section with no body is a gap on
the page and a non-string body throws mid-render.

**Why they want this at all:** the executive's objection to any system is that
it adds work, so the first version must be strictly less work than the PDF.
Their organizer: *"for the app we don't need to input each score, just the final
standings at the end of the night."* Rank in, sheets out. Per-match score entry
is explicitly NOT wanted for v1.

**Still to build:** rank + total-points entry per tier per week (storage is
there now), `lockLadderWeek` preferring a typed rank over a match-derived one,
the officials entry UI, and the gym-sheet **print route** — the sheet builder is
done but only a one-off generator has ever called it.

**Season standings are GOLF SCORING, lowest wins.** A team's score for a night
is its position among all 40 teams — first in Tier 1 is 1, last in Tier 6 is
40 — and the season total is the sum, with the LOWEST total seeded top. Their
organizer: *"first in tier 1 gets 1 pt, last in last tier gets 40 … then we
just total and lowest scores are top seeds."* `lib/scheduler/ladder-overall.ts`.

This is NOT the tier weighting in migration 0115, which is Mango's rule (points
for being in a tier, plus more per set won, higher being better). Two
organizations, two incompatible schemes; they are separate modules on purpose
rather than variants behind a flag.

**Two league rules still unstated, and deliberately not invented:** what a
missed night costs a team (counted as neither zero nor last — the team is
scored only for nights it played, and `nights` is reported so totals over
different week counts are visibly not comparable), and how a tie on total is
broken (tied teams share a seed and the next seed skips).

**Open with the organizer:** Bethune and King printed the same fifteen 6-team
fixtures on the same night with slots 3 and 5 exchanged — one is presumably a
typo. Bethune is followed, being the sheet given as canonical. Also unconfirmed:
whether OUTTAHAND belongs at PPL.

**The org is owned by their organizer, not by us.** It was created here once and
then deliberately deleted and recreated under his ownership — an org belongs to
whoever runs it, and starting it on our account makes every later handover a
migration. 7 venues are geocoded, the 8 tiers exist, the 40 returning teams are
in, and the season's dates and blackouts are set.

**Leacock is TWO venues, not one.** Two double gyms, two courts each. Court
identity is `(venue, label)`, so one venue with four courts would happily put a
game on a court in the other building.

## Auditing the system — `npm run check:all`

Four read-only checks, run together. All four were clean on 2026-09-11.

| Script | Asks |
|---|---|
| `check:policies` | is every `create policy` in the migrations actually live? |
| `check:integrity` | invariants the schema cannot express — orphans, states that should have advanced, double-bookings |
| `check:rls` | can a real captain do what they should, and nothing more? Writes run inside a rolled-back transaction |
| `check:courts` | court-label drift and prime-court fairness on live schedules |

`check:courts` reports 7 known items — mixed court formats and missing rounds on
two older leagues, deliberately not backfilled. Everything else should say
"All policies present." / "No integrity problems found." / "8 passed, 0 failed".

**Two scoping decisions in `check:integrity` worth knowing before "fixing" a
flag.** A team with NO captain is normal twice over: sandbox orgs
(`hidden_from_discovery`) carry hundreds of mock teams, and Mango's ladder has
seven teams the organizer runs himself where no player ever logs in. The check
therefore only flags a captainless team somebody has actually **joined or paid
for**. Unscoped it reported 347 rows, none of them real — the kind of output
that gets a check ignored.

**`check:rls` had a harness bug worth remembering**, because it is the failure
mode these scripts are prone to: the transaction always ends by throwing to
force a rollback, so a value returned from inside it was discarded and every
"anon can read nothing" assertion was comparing against `undefined` — passing
without testing anything. Undefined rows and zero rows are not the same fact.

## Migration 0055 — APPLIED 2026-09-11 (captains can invite again)

`0055_team_invites_captain_rls.sql` had been written and never applied. The only
policy on `team_invites` was `team_invites_admin_all`, scoped to competition
ADMINS, so every captain inviting a teammate hit:

> new row violates row level security policy for table team_invites

That is why all 16 BVL teams had exactly one player. Applied with
`lib/db/apply-0055.ts` (idempotent, safe to re-run) and **verified by inserting
an invite as the reporting captain's own account in a rolled-back transaction**
— the insert that had been failing now succeeds, and nothing was written.

**`npm run check:policies` exists because of this.** The 2026-09-08 migration
audit parsed for columns, tables, indexes and functions — policies are none of
those, so an unapplied RLS policy was invisible to it. The new check reads every
`create policy` out of the migrations and compares against `pg_policies`; it
reports **"All policies present."** as of 2026-09-11.

Three bugs in that check were worth fixing before trusting it, and are worth
knowing if it ever misbehaves again: it filtered `pg_policies` to the `public`
schema (so the seven `storage.objects` policies all looked missing), it captured
the SCHEMA as the table name for a qualified target like `on storage.objects`,
and its drop-detection regex was built from a template literal where `\s` is
just the letter "s" — so it silently never matched, and every superseded policy
looked absent.

## ⚠️ NOT LIVE YET — the Supabase Send Email Hook

The code to send our own auth emails is merged and deployed. **The hook itself
is not switched on**, so Supabase is still sending its own global template and
the reported bug is still reproducible in the way described below. Two steps,
both in the Supabase dashboard, and the ORDER MATTERS.

**Turning it on with the secret missing breaks every sign-up on the platform.**
`app/api/webhooks/supabase-email` returns 500 without `SUPABASE_AUTH_HOOK_SECRET`,
and a Send Email Hook that fails fails the auth request with it. Set the
environment variable first, confirm the deploy carrying it is live, then enable
the hook.

1. **Vercel → Settings → Environment Variables.** Add `SUPABASE_AUTH_HOOK_SECRET`
   for Production (and Preview if you test there). Its value is the secret from
   step 2 — so generate that first, paste it here, and redeploy.
2. **Supabase → Authentication → Hooks → Send Email Hook.** Enable it, point it
   at **`https://www.mysportsapp.ca/api/webhooks/supabase-email`** — the `www.`
   is not optional — and copy the signing secret it generates (`v1,whsec_…`)
   into step 1.

   **Use the `www` host.** The apex 308-redirects to `www`, and a webhook caller
   that follows redirects badly (or not at all) sees a failed delivery. This is
   the SAME trap the Stripe webhook hit — recorded below under what shipped —
   and it costs an hour to diagnose because the endpoint looks fine in a browser.
   Verified 2026-09-09:

   ```
   POST https://mysportsapp.ca/api/webhooks/supabase-email      -> 308 -> www
   POST https://www.mysportsapp.ca/api/webhooks/supabase-email  -> 500 {"error":"not configured"}
   ```

   That 500 is the CORRECT answer for an unconfigured endpoint, and it is how to
   check this without the dashboard: `500 {"error":"not configured"}` means the
   route is deployed and the secret is missing; `401 {"error":"invalid
   signature"}` means the secret is set and the endpoint is ready for step 2.
3. Sign up with a throwaway address from a real league's registration page and
   confirm three things: the email carries the ORGANIZER's logo, it names the
   league, and the link returns you to `/register/<slug>` rather than the home
   page.

**Why this exists.** Supabase's confirmation link goes to its own verify
endpoint, which honours `redirect_to` only when that URL is in
**Authentication → URL Configuration → Redirect URLs**, and silently substitutes
the Site URL when it is not. That is what put a BVL captain on the marketing
home page, signed out, with no idea how to finish registering. Sending the email
ourselves lets the link point straight at `/auth/callback` with the token hash,
so that allow list can no longer break the flow.

**Worth doing anyway, whether or not the hook goes on:** add both
`https://mysportsapp.ca/**` and `https://www.mysportsapp.ca/**` to that Redirect
URLs allow list. It is the actual
root cause, it is a one-minute change, and it fixes the flow for the existing
Supabase-sent emails immediately.

**The fallbacks are already live and need no configuration.** Middleware
forwards any page carrying an auth code to `/auth/callback`, and sign-up writes
the destination to a `pending_registration` cookie the callback reads when the
URL has lost it. So a captain confirming today already gets back to their
registration — the hook is what makes the EMAIL itself carry BVL's branding.

## ⚠️ PARKED — off-platform backups are built but switched OFF

Added 2026-08-26. `.github/workflows/backup.yml` exists, is merged, and is
**`disabled_manually` on GitHub**. Nothing is being backed up outside Supabase
right now. The only protection against losing the Supabase project itself is
Supabase's own daily backups (7 days, same account).

Disabled deliberately: left running it would fail and email every night until
the secrets exist, which trains everyone to ignore the one alarm that matters.

To finish it — full walkthrough in `docs/runbooks/database-restore.md`:

1. Cloudflare R2 → private bucket `sportsapp-backups` + API token scoped to it
2. Supabase → Settings → Database → **Session pooler** URL, port **5432**
   (NOT the `:6543` transaction pooler in `.env.local` — `pg_dump` needs session
   mode; against 6543 it fails partway and leaves a dump that looks fine and
   isn't. The workflow refuses a 6543 URL for this reason.)
3. `openssl rand -base64 32` → store in a password manager, **not** in this
   database and not in the Supabase account. Lose it and every backup is
   unreadable.
4. ```bash
   gh secret set BACKUP_DB_URL
   gh secret set BACKUP_PASSPHRASE
   gh secret set BACKUP_S3_ENDPOINT
   gh secret set BACKUP_S3_BUCKET
   gh secret set BACKUP_S3_ACCESS_KEY_ID
   gh secret set BACKUP_S3_SECRET_ACCESS_KEY
   ```
5. **`gh workflow enable "Nightly database backup"`** — easy to miss, and
   without it steps 1–4 achieve nothing.
6. `gh workflow run "Nightly database backup" && gh run watch`

PITR was priced and declined: $100/month per 7 days, against a busiest-ever day
of 65 sets and only 33 of 90 days with any writes at all.

## Pending manual cleanup (Supabase SQL editor)

```sql
-- diagnostic helpers from the RLS investigation
drop function if exists public.whoami();
drop function if exists public.debug_is_org_admin(uuid);
drop function if exists public.debug_create_comp(uuid);
-- throwaway rows created during debugging
delete from public.competitions where name = 'DEBUG';
```

The throwaway scripts (`lib/db/_inspectorg.ts`, `lib/db/_inspectpol.ts`) are
already gone. Whether the SQL above was ever run is **unconfirmed** — it's
harmless to run again (every statement is `if exists`).

**`lib/db/backfill-localities.ts` — RUN 2026-09-14, nothing left pending.** All
96 BVL address answers now resolve to a town: 70 structured (the player picked a
Google suggestion), 26 geocoded, **0 unknown**. Nine typed addresses were
looked up on that run and every one matched confidently.

Two things a future session should not misread as bugs:
- **Not every BVL player lives in Brampton.** The backfill placed captains in
  Toronto and Caledon, and those are correct answers, not failures. The card is
  counting residents, so a non-Brampton row is the finding.
- **A bare postal code resolves.** "L7A 3J8" came back as Brampton. It works
  because Places is doing the lookup, not the text parser — `addressLocality`
  alone would report unknown, which is exactly why the geocode fallback exists.

Re-running is safe and idempotent: it skips any answer that already has a town,
so it is the right first move if the card ever shows *Not known* again.

## Environment (`.env.local` — gitignored; bring it on the USB stick)

```
NEXT_PUBLIC_SITE_URL=                   # canonical domain used in email links
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # sb_publishable_...
SUPABASE_SECRET_KEY=                    # sb_secret_...  (server-only)
DATABASE_URL=                           # Supabase transaction pooler
RESEND_API_KEY=                         # re_...
EMAIL_FROM=MySportsApp <noreply@mysportsapp.ca>
CRON_SECRET=                            # guards the scheduled digest route
GOOGLE_PLACES_API_KEY=                  # address autocomplete at registration
STRIPE_SECRET_KEY=                      # sk_live_...  ⚠️ LIVE
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=     # pk_live_...  ⚠️ LIVE
STRIPE_WEBHOOK_SECRET=                  # whsec_...    live endpoint
SUPABASE_AUTH_HOOK_SECRET=              # NOT SET YET — see the Send Email Hook section
```

**⚠️ Stripe is on LIVE keys, not test.** Switched over 2026-08-20 with a live
webhook endpoint to match. Anything that takes a payment in this project now
moves real money, and a card charge made while testing is a real charge that
needs a real refund. This file previously said these keys were "not yet present
anywhere", which was three weeks out of date — corrected 2026-09-09 after
reading them out of `.env.local`.

- The **running app does not use `DATABASE_URL`** (it goes through the Supabase
  client) — only Drizzle migrations / `db:studio` do. The pooler password was
  rotated mid-session; if a Drizzle/db command fails with an auth error, refresh
  `DATABASE_URL` from Supabase → Project Settings → Database.
- For just making + pushing a code fix you don't even need `.env.local` (Vercel
  builds with its own env); you only need it to run `npm run dev` locally.

## Big Shoots — now in its organizer's own org (set up 2026-09-15)

- **Org:** Big Shoots Men's Volleyball (`7ba804ce-a223-475a-80dd-48f7492f6078`),
  owned by Liam Johnson (liamjohnson934@gmail.com).
- **League:** Big Shoots Volleyball 2026-2027 (`be28ffa8-7994-486b-8d75-99e0d54cdcf1`),
  `/l/big-shoots-volleyball-2026-2027-2`, **status `scheduled`, public**. Published and scheduled by the organizer after verification on 2026-09-15.
- Fridays 18:45 at Holody Centre (Guelph), 2 courts, **Sep 18 2026 → May 14
  2027**. Each game is 2 sets to 25, cap 27. 3 rounds a night.
- **Season = 11 three-week sessions.** Each session has two regular Fridays and
  a playoff Friday, then everyone is re-drafted onto Team 1–4 (same team rows,
  players move). Every Friday is one complete round robin, so `rounds_per_team`
  = **33** (one per night). Blackouts are **Dec 25 and Jan 1**, which push later
  nights back two weeks. Good Friday is played. 21 and 28 May are deliberately
  unscheduled so the season ends on a full session.
- **Playoff rule (first format, organizer 2026-09-15):** play everybody; the
  most wins THAT night takes the session. Level on wins → more points scored
  that night wins. Read it from the per-night won/lost/tied columns in standings.
  The app has **no** playoff-night label or session-winner list yet.
- ⚠️ **The generator ignores `end_date`.** Season length comes from
  `rounds_per_team`, and a blacked-out night is moved, not dropped. Simulated
  before saving: 198 games, 99 rounds, 33 Fridays, every night a full round
  robin.
- 4 teams with 6 drafted each, 3 sign-ups left available. Copied from Test Org
  by `lib/db/setup-big-shoots.ts`, which is rerun-safe.
- **Schedule generated (2026-09-15): 198 games on 33 Fridays**, Sep 18 6:45 PM
  → May 14 2027. This is exactly the in-memory simulation run before the
  settings were saved, so the blackouts and the 33-night count behaved as
  designed. Public team panels now list each team's six players.
- "Liam Johnson" on Team 1 is **linked to Liam's account** (free agent
  `user_id` plus a `team_members` row). The other 26 have no accounts.
- The **Test Org** Big Shoots league is left as a sandbox. Liam is also a
  `competition_admins` entry there.

## Attendance stats — Days, Missed, PO W (migration 0121)

- **Playoff nights** = every `session_nights`-th *played* night, counted in the
  venue timezone (`nightOf`). Null = no sessions. Only Big Shoots (Liam's org)
  has it set, to 3.
- **Missed needs absences, which are recorded only from 2026-09-15 onward.**
  Lineups saved before 0121 wrote no absences, so no night before then can
  show as missed. There was nothing real to lose: Test Org's only recorded
  night had everyone present.
- **Missed means "did not play AT ALL that night" (changed 2026-09-22).** It
  was previously scoped to the team that rostered you, so a shuffled player
  showed `Days 1` and `Missed 1` for the same night — credited for turning out
  and marked absent for it at once. Owner's rule: "stats goes to players
  irrespective of what team they play … they shuffle. But stats are supposed to
  stay with players." `tallyAttendance` now forgives an absence when the player
  appeared anywhere that night. The old behaviour was deliberate and tested
  ("their own team still needed covering"); that test is reversed, not deleted,
  and carries the reason. **The cost, knowingly accepted:** there is no longer
  any figure for "how often did this team have to find cover" — if an organizer
  ever asks for it, it is a new team-side stat, not a change back.
- **Absences are rewritten on every lineup save**, in the same `writeLineup` as
  appearances. An empty lineup records none. If captains ever record lineups in
  a drafted league, note that `free_agents` may not be readable to them, so
  drafted players could be missed out of absences. Big Shoots has captain entry
  off.
- `getPlayerStats(id, { includeAbsences: true })` is called only by the
  organizer league page. The public page must never pass it.
- **The Edit settings form used to cap round robins at 2** and would have
  shrunk Big Shoots' 33-night season. It is now 1–60, with the current value
  offered in the dialog. Do not reintroduce a 1×/2× refine on
  `editLeagueSchema`.
- `match_appearances` is still not mirrored in `schema.ts` (pre-existing drift).

### Full-time vs subs (2026-09-22)

- **Full-time means ROSTER MEMBERSHIP, never `match_appearances.role`.** The
  organizer's rule: "if a player is on an active roster when the teams were
  created they are a full time player … rest all are subs that are replacing
  them for that night." `PlayerStatRow.fullTime` carries the answer, the stats
  tab renders two tables from it, and `getPartnerGrid` counts only full-timers.
- The two definitions disagree for exactly one player, which is why the
  distinction is not academic: **David Aitken was drafted onto Team 4 but every
  appearance he has is `role: "sub"`** for Team 3. Classifying on role would
  file a drafted player under subs.
- `getFullTimeRoster` unions `team_members` (accounts) with placed
  `free_agents` (everyone else) — the same pair `recordAbsences` uses. Big
  Shoots has **one** `team_members` row for 24 drafted players, so reading that
  table alone reports a roster of one and calls 23 real players subs.
- An **undrafted league** has an empty roster, so every row is flagged
  full-time and one sheet shows. Do not invert this: filing a whole competition
  under "subs" is a worse misreading than not splitting.
- **Renaming a name-keyed player now propagates.** A player with no account IS
  their name (`identityKey` = `n:<normalised name>`), so
  `updateFreeAgentDetailsAction` rewrites `match_appearances` and
  `match_absences` when the name changes. Before this, correcting a spelling on
  the free-agent record created a SECOND player: Big Shoots had three
  appearances as "David Aitken" and three absences as "David Aitkin", showing
  as two rows, one with the games and one with the missed night. Those three
  absence rows were deleted on 2026-09-22 (36 → 33).
- **⚠️ Absences regenerate from the roster, so a stale placement keeps coming
  back.** David's `placed_team_id` is still **Team 4** while he plays for Team
  3. `recordAbsences` marks every placed player not in the lineup as absent, so
  each Team 4 lineup save re-adds his Missed nights — correctly spelled now, so
  they merge into his one row rather than making a phantom, but he accrues
  Missed for a team he does not play for. **Open with the organizer:** whether
  his roster row should move to Team 3.

## ⚠️ A cleared draft leaves no timestamp

- `clearDraftAction` and the tidy-up step in `saveDraftAction` update
  `free_agents` without setting `updated_at`, and there is no trigger to do it.
  **A cleared draft therefore cannot be dated from the database**, and the last
  `updated_at` belongs to whatever wrote before the clear. The Supabase API logs
  are the only record of who cleared it and when.
- Big Shoots' draft was cleared this way on 2026-09-15, some time after 00:46
  Eastern, and restored the same day from the Test Org draft (placements only).
- **Do not rerun `lib/db/setup-big-shoots.ts` to repair a draft.** It also
  resets the league's settings. Restore `status`/`placed_team_id` directly
  instead.

## Sessions on public pages

- In a league with `session_nights`, a public **team panel shows only the
  current session** (`currentSession` in `lib/schedule/sessions.ts`, built on
  `defaultScheduleDay`). This is deliberate, the organizer's choice on
  2026-09-15: the roster shown is only true for the current block. The
  Schedule tab still shows the whole season.
- **Never regenerate a sessions league's schedule to "reset" a session.**
  `generateLeagueScheduleAction` deletes every match, scores and lineups
  included. The season-long 198-game schedule is the intended shape, and
  re-drafting only moves players between the same Team 1–4.
- Past sessions' rosters are not stored. The only roster is each player's
  current placement. If past sessions ever need browsing, derive them from
  `match_appearances` (who actually played).

## Undoing a payment confirmation

- `unconfirm_offline_payment` (migration 0122, applied 2026-09-16) reverses a
  confirmation made in error. Refuses card charges, settled platform fees and
  refunded payments; a second call returns false.
- **It re-gates a team it finds `active` and short of the fee** — including one
  admitted unpaid on purpose, which it cannot distinguish. The organizer clicks
  "Admit anyway" again.
- **Never tell an organizer to use Remove for this.** `removeTeamAction` deletes
  the team, cascades its payments, and deletes the league's matches and pools
  where a schedule exists.
- Used on 2026-09-16 to revert a $2,040 confirmation on BVL Thursday's Serves
  You Right.

## Individual registrants

- **Remove deletes the sign-up** (`removeFreeAgentAction`), it does not withdraw
  it. `registration_payments.free_agent_id` CASCADES, so the payment rows go
  with it. Whether that is allowed depends on **whose money it was** (rule
  changed 2026-09-21):
  - **Card** — refused, always. Stripe holds the truth, a real application fee
    was taken, and the refund is an object we created. **Withdraw** instead.
  - **PayPal / e-transfer with zero fee and nothing settled** — allowed. We
    never touched it and are owed nothing on it; the real record is in the
    organizer's own account. Owner's call: _"We are not accountable for refunds
    outside of the platform."_
  - **`method` null** (rows predating the column) — refused. Provenance unknown,
    and a wrong guess destroys a record that cannot be recovered.
  - A non-zero `application_fee_cents` or a set `platform_fee_settled_at`
    refuses whatever the method, because that row is part of our accounting.
- **A delete now leaves a record** — `removed_signups` (migration 0127), shown
  as the **Removed sign-ups** card on both organizer pages. It holds the person,
  what they had actually paid, a jsonb snapshot of every payment row, and an
  editable note. Written by the `remove_free_agent(uuid, text)` RPC, which
  snapshots and deletes in ONE call: from the client those are two statements,
  and the failure that nobody would notice is a deletion with no record.
  - That RPC carries **only the admin check**, like `delete_competition`. The
    rule about which sign-ups may be deleted stays in `canDeleteSignup` —
    restating it in plpgsql would be a second copy free to drift.
  - The table **cascades with the competition**, unlike `restore_points`, which
    is org-owned so it can outlive one. This is a note in the organizer's books,
    and a withdrawn person's name and email should not outlive their league.
  - It has an **UPDATE policy**, which `restore_points` deliberately lacks. Only
    `note` is ever written after the fact; nothing edits the snapshot.
  - `restore_points` was considered and rejected for this:
    `restoreFromPointAction` is schedule-shaped and `getRestorePoints` has no
    scope filter, so a signup-scoped row would appear in the Restore points card
    offering a Restore that runs the fixture path against a payload with no
    matches.
- Roslyn Ng (BVL Thursday test entry) was deleted on 2026-09-16 under that rule;
  her cancelled $340 request cascaded away with her.
- **The Withdraw button only exists from 2026-09-21.** Before that this section
  claimed "`withdrawn` + Restore remain for that case" and it was not true in
  practice: `setFreeAgentStatusAction` accepted `"withdrawn"`, but the only
  button wired to it passed `"available"` (Restore, which renders only on
  someone already withdrawn). No organizer could reach the state, which is why
  no BVL free agent was ever in it. The refusal message pointed there anyway
  and sent BVL's organizer hunting for a payment screen that does not exist.
- **Individual payments have their own card from 2026-09-21**
  (`IndividualPaymentsCard`, fed by `getIndividualLedger`), on both the league
  and tournament organizer pages. Before it, individuals appeared in no payments
  screen once their payment was confirmed: `getCompetitionLedger` groups charges
  by `team_id` and an individual's charge has none, so those rows fell under a
  `null` key and were dropped — they were never filtered out, just never
  represented. The offline inbox (`getPendingOfflinePayments`) only ever showed
  them while `status = 'pending'`.
- **That query is deliberately NOT Stripe-gated**, unlike `getCompetitionLedger`
  and `getTeamPaymentRows` beside it, and the card renders OUTSIDE the
  `{ledger && …}` guard on both pages. BVL has no connected account at all and
  takes every individual fee through PayPal; bailing on `!mode.configured` would
  blank the panel for exactly the organizers who need it. The `livemode` filter
  still applies when a key IS configured. Keep both properties if you touch it.
- **⚠️ There is still no way to refund an individual's payment, by choice.**
  `RefundDialog` renders only from `payment-team-row`, and
  `getRefundablePayment` returns early unless Stripe is configured and hands
  back a `teamId` — it never reads `free_agent_id`. BVL's individual fees are
  PayPal, confirmed offline, with no payment intent to refund against. The
  owner's position (2026-09-21): _"We are not accountable for refunds outside of
  the platform."_ So the card shows the record and says refunds happen in the
  organizer's own PayPal. Do not add a refund button that implies otherwise.

- The Players tab lists every non-withdrawn free agent — placed or still in the
  pool — after the teams. Edit shows *Sign-up details* when there is a
  `freeAgentId` and *League questions* when there is a `userId`.
- **Individuals ARE now asked the league's registration questions** (changed
  2026-09-24; this bullet said the opposite before). `IndividualSignupForm`
  renders `QuestionFields`, and the answers are saved BEFORE the sign-up and
  before any payment — the reverse order was the bug: a sign-up existed, the
  answers didn't, and nothing ever asked again.
  - Enforced server-side too. `registerIndividualAction` calls
    `unanswered_player_questions` (migration 0104) and refuses while any
    remain. Same rule and same implementation as the waiver gate, so the form
    and the database cannot drift apart. **No migration** — the RPC already
    existed and already defaults to the signed-in user.
  - **Self-serve only, deliberately.** `organizer_add_individual` (0090) is
    untouched: an organizer transcribing a roster cannot answer for somebody
    else, and a guest with no account cannot hold answers at all — they key on
    `user_id`. Check who calls `registerIndividualAction` before adding to that
    gate; today it is only the sign-up form.
  - **Sign-ups made BEFORE this hold no answers, and nothing backfills them.**
    BVL had 3 of 17 answered at the time (against 374 of 382 rostered players,
    on a question marked required). They can be filled in from the Players tab,
    or the player re-saves their own sign-up. Do not invent values.
  - The free-agent draft board still does NOT display the answers; the
    organizer's ask was to see gender while forming teams, and only the
    collection half is done.
- `missingRequired` lives in `lib/registration/required-answers.ts`, not beside
  the form — it is the client half of the rule above and has its own tests.
  `question-fields.tsx` re-exports it for the three older consumers.
- **An organizer can now add a player to the pool** (new 2026-09-25):
  `addPlayerToPoolAction` → `organizer_add_individual`, surfaced as an "Add a
  player" panel on the Free agents card. Name, optional email, optional phone,
  positions and level; `user_id` stays null until that person signs up and
  claims the row.
  - Before this **nothing in the app called that RPC** — no action, no button,
    and `free_agents` has no INSERT policy, so a league whose players don't
    self-register could not be populated at all. Big Shoots' 27 went in via
    `setup-big-shoots.ts`.
  - **0090's insert was also broken**: `coalesce(_email,'')` stored `''`, which
    `free_agents_email_shape` rejects (it allows NULL or a real address, not an
    empty string). So it failed for exactly the emailless names it existed for.
    Fixed by 0129. If you touch that function, keep the `nullif`.
  - The panel renders in the card's EMPTY state as well as the populated one —
    the empty state is a separate early-returned `Card`, and a new league starts
    there. Don't add controls to one and not the other.
- **The Players tab has its own "Add a player"** (2026-09-25), which is where
  organizers actually look — the Free agents card lives on the **Teams** tab,
  and being reachable there was not the same as being findable.
  - It searches the people the ORG already holds: `loadOrgPeople`
    (`lib/queries/org-people.ts`) unions `free_agents` with `team_members`
    across every competition of the org, merges them, and drops anyone already
    in this league. **Searching `free_agents` alone finds nobody for a
    team-entry org** — Mango has zero free agents and 18 teams, which is the
    case it was built for.
  - **No migration needed**: `free_agents_select` admits `is_competition_admin`
    (org-level, per 0029/0043) and `users_select` admits
    `administers_team_member` (0059). RLS is what scopes it to the caller's own
    orgs — there is no org filter in the action, by design.
  - **The client sends only an identifier**; `addOrgPersonAction` re-reads the
    name and email server-side. Do not "simplify" it to accept them from the
    form — that would let an organizer attach any email to any name.
  - **No platform-wide people search, deliberately.** Typing an email to learn
    whether it has an account is not something an organizer should be able to
    do.
  - The account is linked with an UPDATE after the RPC, since
    `organizer_add_individual` always writes `user_id = null`. Without it a
    matched account-holder's appearances key on their name.
  - `personKey` in `lib/registration/org-people.ts` is NOT
    `attribution.ts`'s `identityKey` and must not be merged with it: one decides
    whose stats are whose, the other whether two search results are one person.
- **Pool captains and the captain's draft screen** (migration 0130, 2026-09-25).
  `free_agents.is_captain` is the organizer's mark, toggled from the Free agents
  card. It is **not** `team_members.role`: that governs a team that already
  exists, and at draft time the captains are what create the teams.
  - **`draft_pool(_competition_id)` is what a captain reads** — name, positions,
    grade, status. **Never email, phone or notes.** It is a `security definer`
    function rather than a widened policy because RLS is row-level and cannot
    withhold a column. `apply-0130.ts` asserts this by reading the live return
    signature; keep that check if you touch the function.
  - **A captain must have an ACCOUNT.** `setPoolCaptainAction` returns
    `needsAccount` and the UI warns, because a marked captain with no account
    signs in as nobody and sees an empty screen.
  - **`claim_free_agent_signups()`** adopts pool rows whose email matches the
    signed-in user, run on dashboard load beside `accept_pending_invites`. It
    **skips** any competition where the caller already has their own row —
    `free_agents_one_per_user` is `unique (competition_id, user_id)` and the
    update would otherwise fail the whole claim. Duplicates are possible today:
    `register_individual` upserts on `(competition_id, user_id)` and cannot see
    a null-user row with the same email.
  - The screen is `/draft/<competitionId>`, **read-only on purpose** — picking
    needs a turn order, a lock and a conflict rule. `getDraftPool` returns null
    for anyone who is neither an organizer nor a marked captain and the page
    404s, so it does not confirm the league exists.
  - It **tolerates an unreadable competition row** (a drafted league is usually
    private, and a captain may be no team's member), falling back on the
    heading, and it does not resolve team names for the same reason. Don't
    "fix" that by joining `teams`.
- **⚠️ A drafted player needs a `team_members` row to see ANYTHING** (migration
  0131, 2026-09-25). `my_competitions()` — the dashboard's whole list, in
  0014/0051/0095 — joins `team_members` and never reads `free_agents`. And
  `place_free_agents` only writes a member row for somebody who already had an
  account, because `team_members.user_id` is NOT NULL. Big Shoots ran with **4
  teams and 1 member row** for months.
  - 0130 linked `free_agents.user_id` and nothing else, so six Big Shoots
    players with accounts — five of them placed — logged in to "ask your
    organizer to add you to a team". 0131 makes
    `claim_free_agent_signups()` insert the roster row as well, `'player'` and
    never `'captain'`.
  - **`lib/db/backfill-0131-claim.ts`** repairs people already stranded (the
    function only runs for whoever is signed in). Report-only by default,
    `--write` to act, safe to re-run, emails masked. Ran 2026-09-25: 6 linked,
    5 rosters joined, 0 skipped. Big Shoots now reads 8 linked / 6 member rows /
    0 stranded, with 18 rows still awaiting an account.
  - **Fixed by 0132** (this bullet previously said it was an open gap): an
    unplaced free agent now sees a **"Waiting to be placed"** section on the
    dashboard, fed by `my_pool_signups()`. It is `security definer` for the
    same reason `my_pending_invites` is — `can_view_competition` needs a
    `team_members` row or a PUBLIC competition, and a pool member in a private
    drafted league has neither, so a plain join returns a nameless row.
    - Excludes `placed` (they have a roster row since 0131 and appear under
      "Competitions you play in"; listing both reads as two things) and
      `withdrawn`.
    - The cards are deliberately **not links** — a drafted league is usually
      private, so the public page 404s for exactly these people.
    - "Ask your organizer to add you to a team" on the dashboard now also
      checks `poolSignups.length === 0`. Don't reintroduce that message without
      it: it is what BVL and Big Shoots players were shown while already signed
      up.
    - Lit up 13 linked players across 5 leagues on the day it shipped — 12 BVL,
      1 Big Shoots. It was never a Big Shoots-only problem.
  - If you add another way for a player to join a competition, ask what
    `my_competitions` reads before assuming they will see it.
- `updateFreeAgentDetailsAction` never changes status or placement.
- **An individual must have an account before the form appears** (fixed
  2026-09-16). `register_individual` requires `auth.uid()`, and the form now
  shows *Create an account / I already have one* first, the same gate the team
  path has always had. Before this the prop existed but nothing branched on it,
  so a signed-out player filled in the whole form and was rejected at submit
  with no way back. If individuals should ever be able to sign up WITHOUT an
  account, that is a different change — the RPC and its RLS, plus a decision on
  how an organizer later links the sign-up to a real account.
- The individual form's `returnTo` is `/register/<slug>?as=individual`, and the
  chooser reopens that door from the param. Without it the auth round trip lands
  people back on the two-door chooser with nothing selected, which reads as a
  failed redirect. Keep the param if you touch either piece.

## Who has played with whom

- `getPartnerGrid` (`lib/queries/appearances.ts`) feeds the organizer's Stats
  tab grid and the "Never played together" card under the draft board. It is
  used only for leagues with `track_appearances`.
- **Nights must be taken in the competition's timezone** (`nightOf`), never
  from the UTC date. A Toronto 8:15 PM game is the next day in UTC, which
  doubles every pairing from the last round.
- The draft pool is matched **by account where there is one**
  (`FreeAgent.userId`), because that is how lineups are keyed.

## ⚠️ Membership lives in TWO tables

`team_members.user_id` is **NOT NULL**, so a person with no account cannot be a
row in it. That is why the draft records its result on
`free_agents.placed_team_id` instead, and why `place_free_agents` writes a
`team_members` row only for players who happen to have an account.

**Big Shoots is the live example:** four teams, six drafted players each, and
`team_members` = 0. Anything that answers "who is on this team" from
`team_members` alone reports an empty league.

Already taking the union (correct):
- `lib/queries/lineups.ts` — which is why "Record who played" works there
- `lib/queries/registration-questions.ts` → `getPlayerDirectory` (the Players tab)
- `public.competition_player_names` (migration `0120`) — the public page and
  team-wide stats
- `match_appearances` never needed it: it stores `player_name` with a nullable
  `user_id`, so player stats already credit people without accounts (identity
  falls back to the normalised name — see `identityKey`)

Deliberately NOT taking the union:
- `getTeamRoster` / `getTeamRosters` — shared with split payments, and a share
  needs somebody who can actually pay it
- `getCompetitionWaiverState` — signing needs an account
- `getTeamChoiceMix` (Roster mix) — a drafted player's grade is
  `free_agents.skill_level`, not a registration answer, so there is nothing to
  tally

**Latent trap:** `team_entry_blocked` (migration 0101) counts `team_members`
for `min_roster_for_entry`. Big Shoots has no minimum set, so nothing is held
today — but set one on a drafted league and every full team reads as roster
short. Fix that before recommending the setting to a draft organizer.

**When these players get accounts**, identity switches from name to `user_id`.
Anyone with appearances recorded under a bare name AND later under an account
counts as two people for the season; backfill `match_appearances.user_id` at
the same time as creating the accounts.

## Summer Forever — two 12-team brackets in one competition (Sat Sep 19 2026)

Beach Barbiez (`54a3e41d-ff3c-41e8-98e4-cd125edcf277`), competition
`0cd5f0da-99e0-480c-a7c0-019b4d85d7a9`, beach 2s, **private**, Mooney's Bay.
24 teams in two divisions — **Mens 12, Womens 12** — 3 pools each, 36 pool
matches. Note `start_date` says Sep 18; the matches are the truth. Pool format
best-of-2 to 21; the bracket inherits the competition format, best-of-3 to
21/21/15. 8 courts.

**Pool play was re-timed on 2026-09-16 and now runs 09:00–12:45** — five waves
at 09:00 / 09:45 / 10:30 / 11:15 / 12:00, last game ending 12:45. It was six
waves finishing 13:30. `teams_referee` is **false** for this competition (the
only one), which is what let the scheduler pack games across pool boundaries;
all 36 matches have `ref_team_id` null. **Mens play Courts 1, 3, 5, 7 and
Womens 2, 4, 6, 8** — verified, no court hosts both. The last wave uses only
two courts per division because 18 games don't divide by 4, and each pool has
one back-to-back pair, which is unavoidable here (see the test file for why).

This was applied through the **re-optimize** planner, not regeneration, so the
draw, who plays whom and games-per-team are untouched. If anyone needs to redo
it: Re-optimize schedule reproduces it, including the court split.

**⚠️ REGENERATING POOLS THROWS THIS AWAY.** It happened on 2026-09-17: the
organizer re-drew his pools and the schedule came back with referees on all 36
matches, 6 courts and 6 waves, finishing 13:30 again. Re-optimize restores it
(and did), but the draw is rebuilt from scratch either way, so avoid
regenerating this close to the event.

The reason it reverted is worth knowing, because it is fixed but the shape of
the trap is general: `divisions.courts` is now set here (**Mens `[1,3,5,7]`,
Womens `[2,4,6,8]`**), and giving a division its own courts routes generation
through `layoutMultiDaySchedule` instead of the single-day path.
`teams_referee` was only wired into the single-day path in 0124, so the better
the setup, the more certainly a regenerate undid it. `layoutMultiDaySchedule`
now takes the same options — and preserves wave slots rather than compressing
each court's games, because under wave packing an idle court in a wave means
those teams are playing elsewhere in it. Compressing double-books people.

The organizer wants **single elimination, everyone in, seeds 1–4 on byes** —
the standard 12-team chart. Our generator already produces it exactly; it is
locked by `tests/scheduler/bracket-12-team.test.ts`.

**The playoff format is SAVED** (migration 0125, done 2026-09-17):
`playoff_advance_mode = overall`, `playoff_teams = 12`
("everyone makes playoffs"), `playoff_third_place = true`,
`playoff_courts = [2,4,6,8]`. Stored per competition, so **both divisions pick
it up** and the two brackets come out the same shape — the organizer's
requirement, and previously left to whoever set two panels identically on the
morning. Verified: 12 teams gives 11 matches, byes to seeds 1–4, round one
8v9 / 5v12 / 7v10 / 6v11.

**⚠️ THE TWO DIVISIONS PLAY ON DIFFERENT NET HEIGHTS.** Mens use courts
**1, 3, 5, 7** and Womens **2, 4, 6, 8** — that split is physical, not a
preference, and it is why `divisions.courts` is set. It also broke an assumption
in 0125: `playoff_courts` is one row for the whole competition, so the saved
`[2,4,6,8]` (whichever panel saved last) would have put the MENS bracket on the
Womens nets. Since 2026-09-17 each Generate panel defaults to **its own
division's courts**, ahead of the saved format — precedence is division courts →
saved format → all courts. Do not "fix" the saved value by clearing it; blank
means every court, which is the same mistake in reverse.

The 3rd-place game saved as **true**. It was not in the organizer's chart and
may have been caught by accident — worth confirming, since it adds a match per
division alongside the final.

**On the day:** pool play ends 12:45, then the Playoffs tab shows **one Generate
panel per division**. Generate each separately — that is what migration 0123
made safe; before it, generating the second wiped the first. 22 bracket matches
over 4 sequential rounds is roughly 3 hours on 6 courts, less on 8, inside the
17:00 close.

**Generate is now held until every pool game has a final score** (`requireComplete`
on the panel, true for tournaments only). The button is disabled and the warning
turns red until then. Leagues keep the old warning-only behaviour on purpose: one
abandoned game that never gets a score would otherwise lock an organizer out of
their own playoffs permanently.

**Both earlier open items are now closed** (2026-09-17):
- `target_games_per_team` was corrected from 2 to **3**. That stale 2 was what
  made the app keep proposing 4 pools of 3 — a target of 2 sizes pools at
  target+1. With it at 3 the draw is 3 pools of 4 per division, each pairing
  meeting once at best-of-2 = 2 sets, which is exactly what the organizer asked
  for.
- **"TBD" was re-seeded to the bottom.** It was a placeholder at seed 2 — Pool
  B's TOP seed — and the team has since confirmed. It swapped places with
  Stepladder Duo: TBD is now **seed 12 in Pool A**, Stepladder Duo **seed 2 in
  Pool B**, and Pool C is untouched. Done as a swap of seed, pool and fixtures
  rather than a redraw, so every time, court and wave stayed exactly as it was.
  Safe only because nothing had been played; all three Womens pools were
  re-verified as clean round robins afterwards. The team will likely be renamed
  now it is confirmed — that is just a team edit and disturbs nothing.

Note the snake draft puts seed 12 in **Pool A with the top seed** — correct, and
the opposite of what "bottom seed" intuitively suggests.

`playoff_teams` is no longer on this list: saving the format sets it, so the
owner can do it from the UI rather than needing a DB write.

## BVL Reverse Pairs — 25 Sep 2026 (set up 2026-09-25)

Org **Brampton Volleyball League**, competition
`c0ffaa7e-5ed4-493a-a6ca-78657b086c54`, slug `bvl-reverse-pairs-2026-09-25`.
Built by `lib/db/setup-bvl-reverse-pairs.ts`, **draft** and **private** — the
organizer publishes it. indoor6, Notre Dame Catholic Secondary School, Fri 25
Sep, first game **19:30**.

**14 pairs, 2 courts, 7 rounds, 16-minute TIMED games, `point_cap = 10`.**
14 games, 84 lineup rows, **6 games each**, everyone sits out exactly once.
Runs 7:30–9:22pm.

- **The arithmetic, so nobody "fixes" the round count.** Three pairs a side = 6
  pairs a court = 12 on court, 2 sitting. Games per pair is `12 × rounds ÷ 14`,
  whole only when rounds is a multiple of 7. **Exactly 7 games each is
  impossible for any arrangement**: every game consumes exactly 6 pairs, so
  total appearances is always a multiple of 6, and 14 × 7 = 98 is not. 7 rounds
  (6 each) is the format-correct night; 9 rounds would give 8/7 and was
  rejected because everyone must play the same number.
- **⚠️ `point_cap` has NO UI.** `updateReversePairsSettingsAction` does not
  carry `pointCap`, so it is settable only by SQL. Saving the settings form does
  NOT wipe it — that update lists its columns and omits this one — but don't
  assume an organizer can change it.
- **The cap applies to the DIFFERENTIAL only.** `pointsFor`/`pointsAgainst`
  stay raw (they are points actually scored) and `won`/`lost` are untouched.
  `reversePairsStandings(ids, games, { pointCap })`; omitting the option is
  uncapped, which is how every pre-0133 night still scores.
- **The draw action honours `competitions.start_time`** since 2026-09-25,
  falling back to `19:00`. Before that it hardcoded 7:00pm, so a redraw would
  have moved this night half an hour earlier. Keep that fallback.
- `setup-bvl-reverse-pairs.ts --redraw --write` redraws in place: it deletes the
  games (lineups cascade), rewrites `rounds`/`courts`/`minutes_per_game`/
  `point_cap`, and **refuses if any score has been entered**. It also aborts on
  an uneven draw rather than writing one.
- Draw quality on the night as drawn: 2 repeat partnerships, 82 distinct of 91,
  11–12 partners each against a ceiling of 12. Seed 1 — the same seed always
  yields the same draw, so a redraw with nothing changed reshuffles nobody.
- Samuel cancelled and is not in the field; Chris & Erika joined late.

## Mango Sports Friday Mens League — a drafted 2-week cycle (set up 2026-09-25)

Org **Mango Sports** (`0c1cf5aa-c34c-4425-8a13-a711579dc53e`), competition
`ed052851-387e-443f-9cb8-1b91f8291b24`, slug `mango-sports-friday-mens-league`.
Created by `lib/db/setup-mango-friday.ts` in one transaction, not through the
UI. **draft** and **private** — nothing public until the owner publishes.

indoor6, **Fridays 20:00**, **1 court**, venue "Mango Sports" (the same string
both their other leagues carry). Sep 25 → Dec 18 2026. `rounds_per_team = 2`,
`games_per_week = 4`, `minutes_per_game = 20`, `session_nights = 2`,
`tiebreaker = headToHead`, individual sign-ups ON with a cap of 18. Match
format one set to 25, win by 2, copied from their other leagues.

**No schedule was generated, deliberately.** Fixtures follow the draft, and the
playoff pairings follow week 1's results.

⚠️ **Its page threw a server-side exception for the first hour, and the cause is
a trap for every setup script.** `setup-mango-friday.ts` bound
`${JSON.stringify(x)}::jsonb`. **postgres.js already JSON-encodes a parameter
bound to jsonb**, so the value was encoded twice and stored as a jsonb STRING
scalar — `"{\"winBy\":2,…}"` rather than `{"winBy":2,…}`. `getLeagueDetail`
reads `weekly_slots[0]`, and indexing a string yields `"["`, so the slot has no
`startTime` and the page falls over.

- **Pass the OBJECT** (`sql.json(value)`) for a jsonb column and let the driver
  encode once. Never pre-stringify. Applies equally to `setup-big-shoots.ts`,
  `setup-smva*.ts` and anything new.
- **Verify with `jsonb_typeof`, not by reading the value back.** The script
  printed its own read-back and it looked fine — `JSON.stringify` of a string
  renders as an escaped string, and the escaping is the only tell.
- Repaired on 2026-09-25 with `(col #>> '{}')::jsonb` guarded on
  `jsonb_typeof(col) = 'string'`. `match_format` and `weekly_slots` now read
  `object` and `array`.
- `league_settings.blackout_dates` is a **`date[]`, not jsonb** — `jsonb_typeof`
  on it errors.

THE FORMAT, in the organizer's words: 18 players, 3 captains; captains pick
teams every 2 weeks; week 1 is a round robin of 6 games (three teams, each pair
twice) at 20 minutes; week 2 is playoffs, first place byeing to a 9pm final
while 2nd and 3rd play an 8-9pm semi; then re-draft and repeat.

- **20:00 was INFERRED, not stated.** He said "Friday nights at the same venue
  Mango Sports Tuesday does" and gave no time; 8pm is the only start that makes
  his own 8-9 semi / 9-10 final work and lets week 1's six games finish at the
  same hour. Their Tuesday leagues start 19:00. Worth confirming.
- `rounds_per_team = 2` IS the six games — two full round robins between three
  teams. Don't "correct" it to 1.
- The org's only `venues` row is **Overtime Athletics**, Mississauga, with no
  court count. The league's `venue` is the free-text "Mango Sports"; they are
  not linked.

**Known gaps for this format — none of these are built:**
- **Captains cannot draft themselves.** `saveDraftAction`/`clearDraftAction` are
  `is_competition_admin`. The organizer enters their picks.
- **A second playoff draw DELETES the first one's matches and scores.** Both
  generators clear every row with a non-null `bracket_position` first, so a
  playoff every 2 weeks cannot accumulate. This is the blocker to fix before
  cycle 2 plays.
- **Standings are cumulative across re-drafts**, keyed on team id, so from cycle
  2 "first place" spans rosters that no longer exist. `lib/queries/ladder-standings.ts`
  is the working template for a night-scoped table.
- **Use the GENERIC bracket path** (`generateBracketAction`) for 3 teams — it
  handles the 1-seed bye correctly. `server/actions/league-playoff.ts` hard-
  rejects anything under 8 teams.
- **Never tick 3rd place on a 3-team bracket**: `nextPowerOfTwo(3)` is 4, so the
  `champSize >= 4` guard passes and an empty extra match is inserted.
- No test covers a bracket of exactly 3 (nearest are 2 and 5).
- 18 players over 3 teams is **6 a side with no subs**; one absence and a team
  plays short.

## Mango Sports Coed Fall Season 7 2026 — a 6-tier ladder (set up 2026-09-16)

Org **Mango Sports** (`0c1cf5aa-c34c-4425-8a13-a711579dc53e`), competition
`9e7025bd-0895-436d-b346-a1704edab5cb`, slug `mango-sports-coed-fall-2026`.
Created as "Mango Sports CoEd Fall 2026" and renamed by the owner the same day —
the **slug did not change**, so it is still the fall-2026 one.

indoor6, **draft** and **private** — nothing is public yet. Tuesdays,
**19:00–23:00**, venue "Mango Sports" (copied from their Short Summer Season),
3 courts. **Sep 22 → Dec 8 2026**, blackout **Oct 27**, so 12 weekly dates =
**11 playing nights**. Created by script in one transaction, not through the UI.

**6 tiers × 3 teams.** Seeded as `Team 1`–`Team 18` in tier order (Tier 1 =
Teams 1-3, and so on) and **being renamed in place by the owner** — 9 of 18 as of
2026-09-16 (Mangalore Marvels, Toronto Panthers, Manila Phantoms, Colombo
Tigers, Mississauga Lions, Muskoka Moose, Kingston Heat, Punjab Power, Kochi
Knight Riders). `teams.seed` still carries the original 1–18, which is what puts
them in tier order, so don't key anything off the name.

Ladder on, promotion/relegation on, `ladder_swaps = [1,1,1,1,1]` — one up and
one down at each of the five boundaries.

**Who goes up is decided by `league_settings.tiebreaker`.**
`lockLadderWeekAction` reads it, `rankLadderNight` → `rankStandings` orders each
tier on that night alone, and `applyLadderMovement` promotes the top. Nothing
bypasses it: `ladder_placements.result_rank` (a typed-in finishing order) is
filled **nowhere in the database** and the lock has no branch for it.

Mango is on **`headToHead`** since 2026-09-23 (was `ova`). That mode resolves
**wins → head-to-head wins → head-to-head POINT DIFFERENCE → point ratio**. The
second head-to-head pass exists because this league's tiers are three teams
meeting twice, so splitting a pair is routine and the organizer's rule is that
the margin across the two games settles it: "beijing came in on top by 1 point.
And they need to be top." Difference, not points scored — confirmed against
Tier 5, where the team that scored the most also had the worst margin.

**Week 1 was unlocked and re-locked on 2026-09-23** under the corrected
tiebreaker. Two moves differ from what the first lock produced: **Beijing
Dragons** went up to Tier 2 instead of **Kochi Knight Riders**, and **Dubai
Falcons** dropped to Tier 3 instead of **Osaka Onis** (Osaka escaped on a +1
head-to-head margin, 48 v 47). The other eight moves are unchanged, and Tiers 4
and 5 were unaffected — their ties were for second place, which moves nobody.

**⚠️ Week 2's fixtures still encode the PRE-correction ladder and must be
redrawn.** They were drawn at 09:04, before the re-lock wrote the new
placements at 21:10, so they pair Kochi into Tier 2 and Beijing into Tier 3.
The games are internally consistent and the 19:00/21:00 court grid is correct —
they are simply the wrong teams. Redrawing week 2 replaces all 36 (none have
results). This cannot recur: unlocking now removes the fixtures too.

**If it is ever switched mid-season, the order is unlock → re-lock → draw.**
`drawLadderWeekAction` draws `latestWeek`, so drawing before the re-lock targets
the already-played week and is refused; after it, the week is drawn from the
corrected ladder.

**Since 2026-09-23 `unlockLadderWeekAction` also deletes the next week's
FIXTURES**, not just its placements — they are derived from exactly the rows it
removes. It refuses outright if that week already has results, rather than
discarding scores. Before this change the fixtures survived the undo and still
paired teams by the old ladder: internally consistent, completely wrong, and
invisible. That is what happened to Mango's week 2 (drawn 09:04, re-locked
21:10 the same day).

**Tiers can be corrected from the Teams tab** (shipped 2026-09-17): each team
row has a tier dropdown, **while the season has not started**. The organizer
mis-seeded the tiers here, which is what prompted it. Once week 1 is drawn the
control refuses, because from then on the night is built from
`ladder_placements` and `teams.division_id` is no longer read — a hand-move
would appear to work and move nobody. Undo the latest week if a tier genuinely
has to change mid-season. Rule and tests: `lib/ladder/tier-move.ts`.

**Nobody is invited yet**: 0 teams claimed, 0 pending invites (checked
2026-09-16). The org's next step is an "Add captain" per team.

**Scored by PLACEMENT, where the lowest total wins** — confirmed by the owner
2026-09-17 and built as migration `0126`. `league_settings.ladder_scoring` is
`placement` here; every other league in the database is `points` and unchanged.

Each night a team scores its tier's number plus where it finished:
`weight_base` is what finishing FIRST in that tier scores, so 1/2/3 in Tier 1,
4/5/6 in Tier 2, down to 16/17/18 in Tier 6. Bases are 1, 4, 7, 10, 13, 16.
Season total is the sum, **lowest wins**. Sets won score nothing, so
`weight_per_set_win` being null is correct here rather than a half-filled
config — which is exactly what it looked like before 0126 existed.

**Why it needed a new mode rather than different numbers.** 0115's weighting
(written for Mango's Short Summer Season: Tier 1 `10/5`, Tier 2 `5/2`) scores
`base + setsWon × perSetWin` and sorts highest-first, so winning sets RAISES a
total that placement scoring needs to fall. Opposite directions, irreconcilable
by choice of weights. SMVA, despite being the stated reference, has no 0115
weights at all — all null.

**Where the finishing order comes from**, in order: `ladder_placements.result_rank`
if an organizer typed it (0117), else derived from that night's results via
`rankLadderNight` using the league's own tiebreaker. A night with no results is
skipped, never scored — zero would beat winning Tier 1.

**⚠️ Nothing will show until nights are scored.** As of 2026-09-17 there are
week-1 placements for all 18 teams but **zero completed matches and zero sets**,
so the table is legitimately empty. Also: nothing yet fills in `result_rank` —
there is no UI for typing a night's finishing order, so today the only route is
entering every set. For a six-court night of 20-minute sets that may not be
realistic, and a rank-entry screen is the obvious next build.

**⚠️ Missing a night lowers a total, which under "low is good" flatters it.**
Inherent to summing; it doesn't bite while all 18 teams play weekly. A team
matching a total over MORE nights is ranked ahead, which is the only defence in
there. If absences become normal, average-per-night is the fix.

**Five player questions** (all required): First Name, Last Name, Sex
(Male/Female/Non-Binary, matching Mango's four other leagues), Position you Play
(LS/RS/Setter/Middle/Libero, single choice), Tshirt Size (XS–XXXL).

**⚠️ The waiver is what makes those questions appear.** The dashboard builds its
questions prompt **only from competitions with an outstanding waiver**
(`dashboard/page.tsx`, and the comment there says so deliberately: the details
ride on a gate that already exists). No waiver = nobody is ever asked, and
"required" means nothing.

**The waiver exists as a DRAFT** (2026-09-17): org waiver **v1**,
`e19d7bc5-afbc-4097-b1cb-d04cc4382fdb`, "Mango Sports Co. — Fall Volleyball
League Waiver", transcribed from the owner's Tally form
(`tally.so/r/RGOxZJ`) into five numbered clauses — Assumption of Risk, Waiver
and Release, Medical Authorization, Confirmation of Age, Acknowledgement — with
`{{name}}` for the participant. The three Tally checkboxes became clauses 4 and
5 so they can be initialled rather than flattened into prose.

**It is deliberately not approved.** `approve_waiver` computes the body checksum
and records who approved it; that is a legal act and should carry the owner's
identity, not a setup script's. Nothing is enforced until the owner approves it
and attaches it (Waivers card → approve → require for this league).

**What attaching it does, precisely.** `setCompetitionWaiverAction` re-syncs
every team, but `team_entry_blocked` tests `exists(... team_members ...)` — so a
team with **no rostered players is NOT blocked**. Mango's 18 empty teams stay
`active` on attach; the gate bites as players join, and adding a player later
re-opens it. To hold teams until their rosters are filled, set
`min_roster_for_entry` in the same dialog — that check runs FIRST and does catch
an empty roster.

**⚠️ Venue disagreement, unresolved.** The waiver names **Overtime Athletics,
1400 Aimco Blvd Unit 22 & 23, Mississauga**. The competition's `venue` says
"Mango Sports", copied from the Short Summer Season. One of them is wrong and
the waiver is the likelier truth — confirm before the schedule is published.

**How players arrive:** the org invites a captain per team, the captain invites
the rest. Note the captain therefore **claims** a pre-made team rather than
registering one, and `/claim/[token]` asks nothing — so the captain answers the
five questions on their dashboard like everyone else, not at registration. This
flow only works because of the "Add captain" fix shipped the same day; before it,
these 18 teams showed "No captain added yet." with no button.

**The per-night format** (set 2026-09-16). Each tier's 3 teams play each other
**twice**, one set a time, **20 minutes a set** — 6 sets on the court, **4 per
team**, 120 minutes. Two waves on 3 courts:

| Court | 19:00 | 21:00 |
|---|---|---|
| 1 | Tier 1 | Tier 2 |
| 2 | Tier 3 | Tier 4 |
| 3 | Tier 5 | Tier 6 |

Stored per division: `start_time`, `courts` (a plain court NUMBER array, first
entry wins), `minutes_per_set = 20`, `ladder_target = 4`. `league_settings`
carries the same target and `minutes_per_game = 20` as the fallback.

**`ladder_target` is sets PER TEAM, not sets in the tier.** `splitTierNight`
does `base = floor(target / (n - 1))`, so 3 teams at target 4 gives every pairing
exactly 2. Setting it to 6 here — the natural misreading, and what the Short
Summer placeholder held — would mean each pair three times and a 180-minute
tier, which does not fit between 19:00 and 21:00.

**⚠️ The per-tier night path is all-or-nothing.** `server/actions/ladder.ts`
uses it only when EVERY division has both `start_time` and `minutes_per_set`
non-null; clear one and the whole league silently reverts to shared-court
packing with tiers sharing a wave. Verified true for all six on 2026-09-16.

**The 20 minutes is a CAP, not the expected length** — and the two waves are
back to back on purpose. 19:00 + 6 sets × 20 is exactly 21:00 with no
changeover, which looks tight on paper; the owner confirmed (2026-09-17) that
sets finish well inside the cap and they have run this format before. So the
slack is real even though the arithmetic shows none. **Don't "fix" this by
shortening the sets or padding the second wave.**

**Open:** the set's point target is unconfirmed. `match_format` is best-of-1 to
**25, win by 2**, carried from the Short Summer Season and left alone — with a
20-minute clock over it. Change it if 25 is wrong.

**No schedule has been generated.**

## Known quirks

- **Migrations `0050`+ are hand-written SQL**, not drizzle-kit output — `npm run
  db:migrate` won't apply them. They're applied with a throwaway node script that
  runs the file's statements against `DATABASE_URL` (split on
  `--> statement-breakpoint`). **Applying one to prod needs the owner's explicit
  go, every time.** Keep the schema in `lib/db/schema.ts` in sync by hand.
- **Rewriting `place_bracket_winner` is how you break a playoff night.** Five
  migrations now define it — `0013` (winners), `0026` (track scoping), `0094`
  (the 3rd-place game), `0099` (placement track + first-round loser routing) and
  `0123` (division scoping). It is NOT a simple winner-advancer any more, and
  each rewrite must carry all of it forward. 0123's first draft was written from
  the 0013 text and silently dropped the placement early-return, the loser
  routing and the bronze game; it reached prod in that state before being caught
  and restored. `lib/db/apply-0123.ts` asserts each behaviour **by name** — copy
  that pattern for any future rewrite, because the loss is invisible until an
  organizer enters a score on the day.
- `next build` can **OOM** on low-RAM machines during static generation. The
  reliable gates are `tsc --noEmit`, `npm run lint`, and `npm test` — the
  pre-commit hook runs `prettier --check` + eslint + vitest, so run
  `npm run format` before committing.
- Vercel deploy = push to `main`; watch the commit status for success.
- **Git ref corruption after an abrupt restart** (this repo lives in a OneDrive
  folder): a hard restart can leave `.git/refs/heads/main` (and/or
  `.git/refs/remotes/origin/main`) filled with null bytes — git then reports
  _"branch appears to be broken / No commits yet."_ The objects are fine; only
  the tiny ref file is bad. Fix: find the real tip (`.git/packed-refs`,
  `.git/ORIG_HEAD`, `git fsck`, or `git log origin/main`), then
  `rm .git/refs/heads/main && git update-ref refs/heads/main <sha>`. Verify the
  tip is the true one (origin's loose ref under `.git/refs/remotes/origin/` may
  be newer than `packed-refs`) before trusting it.
