# HANDOFF — volleyball-platform

> Cross-machine continuity note. Claude Code chat history lives **locally per
> machine** and does NOT travel with the repo, so this file is the bridge.
> **To resume on a new machine:** start Claude Code in the project root and say
> _"read HANDOFF.md, CLAUDE.md, and PRD.md to catch up."_

---

## Current state (last session — 2026-08-13)

- **Branch:** `main`. **Latest commit:** venues + Slice C completion — pushed, working tree clean, no unmerged feature branches.
- **GitHub:** `https://github.com/tixcheck/sportsapp.git`
- **Vercel project:** `my-sports-app/sportsapp` (auto-deploys on push to `main`; the GitHub commit status is the deploy signal).
- **Supabase project:** `evngfeuqyllfwkdvsrsb`. **Migrations written through `0071`, and all of `0060`–`0071` verified as applied against the live database on 2026-08-13.** From `0050` on they are **hand-written SQL** applied with a throwaway node script (drizzle-kit won't run them), so Drizzle's tracking doesn't know about any of them — see Known quirks.
  - **`0071` (venues) IS applied** — 2026-08-13. A `venues` table scoped to the
    ORG (name, address, entry_notes, doors_note), plus `matches.venue_id` and a
    `venueId` on each `LeagueCourt`. Org-scoped on purpose: the same gyms come
    back every season, and BVL's Terry Miller is now one row shared by two
    leagues.
    - **Court labels are NOT unique across venues.** Every school gym has a
      "Court A". Court identity is `(venue, label)` — never the label alone.
      Anything comparing courts by label is a latent bug; `sameCourtRef` in
      `lib/venues/resolve.ts` is the correct comparison.
    - The By-court schedule view had exactly that bug and is fixed.
    - `on delete set null`, so removing a venue never deletes its games.
    - **Still single-venue-only:** `weekly_slots` has one start time for the
      whole night (BVL starts 6:00/6:15/6:30 at different gyms), and the
      generator is not venue-aware — nothing stops it scheduling a team in two
      buildings back to back.
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
- **Tests:** `npm test` → **760 passing across 65 files** (verified 2026-08-13). tsc, eslint, prettier and `next build` clean.
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

## What shipped recently (newest first)

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
```

Coming with payments (not yet present anywhere): `STRIPE_SECRET_KEY`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` — test set first.

- The **running app does not use `DATABASE_URL`** (it goes through the Supabase
  client) — only Drizzle migrations / `db:studio` do. The pooler password was
  rotated mid-session; if a Drizzle/db command fails with an auth error, refresh
  `DATABASE_URL` from Supabase → Project Settings → Database.
- For just making + pushing a code fix you don't even need `.env.local` (Vercel
  builds with its own env); you only need it to run `npm run dev` locally.

## Known quirks

- **Migrations `0050`+ are hand-written SQL**, not drizzle-kit output — `npm run
  db:migrate` won't apply them. They're applied with a throwaway node script that
  runs the file's statements against `DATABASE_URL` (split on
  `--> statement-breakpoint`). **Applying one to prod needs the owner's explicit
  go, every time.** Keep the schema in `lib/db/schema.ts` in sync by hand.
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
