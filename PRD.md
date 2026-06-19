# Volleyball Platform — Product Requirements (v0)

> A volleyball management web app for organizers and players in Toronto. Free for organizers. Built to feel like a community tool, not a SaaS dashboard.

---

## 1. Vision

A volleyball app for **players, built by a player**.

- **Players** just show up and play. They open the app, see their next match, enter scores, see standings. Zero friction.
- **Organizers** feel relief, not work. The boring stuff (scheduling, standings, reminders) happens for them.
- **The whole thing feels like Toronto volleyball** — community-driven, light, fast — not enterprise software.

We are deliberately building an **alternative**, not a competitor. Many Toronto organizers don't use existing platforms; the goal is to be the obvious, simple choice for those organizers.

Inspirations:
- **CBVA** (cbva.com) — clean, light, register-and-play simplicity
- **myteam.click** — minimal functional aesthetic
- **OVA tournament app** — data-richness for standings and tiebreakers (without the visual weight)

---

## 2. Guiding Principles

Every product and code decision must pass these:

1. **Simple beats clever.** If a feature isn't needed for v0, it does not exist.
2. **Players first.** When a tradeoff is between making the organizer's life easier and the player's life easier, the player wins.
3. **Volleyball-native.** Use the language of the sport (sets, pools, brackets, tiebreakers) — not generic "event management" vocabulary.
4. **AI where it's magical, not where it's marketing.** No chatbots in corners. AI shows up only where it removes real work (e.g., Excel import, sub matching — both post-v0).
5. **The schema must outlive v0.** Build the data model thinking about the sub marketplace, social features, and tournaments-of-tournaments that come later. Don't bolt them on.

---

## 3. Target Users

### Persona 1 — The Organizer ("Mark")
Runs a Tuesday-night indoor 6s league with 12 teams and a Saturday beach tournament once a month. Currently juggling Google Sheets, a WhatsApp group, and e-transfers. Doesn't use OpenSports because it's overkill and takes fees. Wants something that just works.

### Persona 2 — The Captain ("Priya")
Captains one of Mark's teams. Submits scores after each match. Needs to find a sub roughly twice a month. Wants the app to tell her: when is my next match, who am I playing, and how do I get the score in.

### Persona 3 — The Player ("Sam")
On Priya's team. Doesn't want to think about anything except showing up. Wants: schedule, standings, a calendar reminder.

### Persona 4 — The Tournament Player ("Dana")
Plays a different beach tournament most weekends. Doesn't have a "team" in the league sense — registers a 2s partnership per tournament. Wants to see pool, schedule, and live standings on her phone during the day.

---

## 4. v0 Scope

### IN scope for v0

**Authentication**
- Email/password
- Google sign-in (Supabase Auth handles both)
- Email verification
- Password reset

**Organizations**
- One user can create/own multiple organizations
- An organization owns leagues and tournaments
- Lightweight: just a name, slug, logo, and contact email for v0

**Sports & formats**
- Indoor 6s
- Beach 2s
- Co-ed 4s

Each sport configures default match formats and roster sizes (see Section 6).

**League management**
- Organizer creates a league: name, sport, season dates, weekly time slot(s), venue, courts, division tiers
- Add teams; each team has a captain + roster
- Auto-generate a **round-robin schedule** across the season (Section 7)
- Manual schedule edits (drag-to-reschedule, swap courts)
- Standings update automatically as scores come in
- Public league page (no login needed to view schedule + standings)

**Tournament management**
- Organizer creates a tournament: name, sport, date(s), venue, courts, division structure
- Teams register (organizer can manually add or open public registration with a simple form)
- Auto-generate **pool play** schedule (Section 7)
- Auto-generate **single-elimination bracket** after pools close
- Standings within each pool update live
- Public tournament page

**Score entry & confirmation**
- Either team's captain can enter scores for their match
- The other captain receives a notification to confirm
- Once confirmed, standings recalculate
- Scores can be edited (with audit log) until end of day; after that, organizer-only

**Standings**
- Real tiebreaker logic (Section 8) — no fudging
- Display: MW (matches won), ML (matches lost), SW (sets won), SL (sets lost), PF (points for), PA (points against), Ratio, Position
- Hovering or tapping the position number shows the tiebreaker calculation that produced it (like the OVA app)

**Notifications (email only in v0)**
- Weekly match reminder (Sunday evening: "Your matches this week")
- "Confirm scores" nudge to opposing captain
- "Schedule changed" if organizer edits a match
- "Standings update" weekly digest (optional, opt-in)

**Mobile-first PWA**
- Installable from browser
- Works on iOS, Android, desktop
- Offline-friendly for viewing schedule (read-only when offline)
- Light & airy aesthetic; CBVA-inspired

### OUT of scope for v0 (explicit cut list)

These are intentionally deferred. Do not build them in v0.

- ❌ Payments (Stripe) — added in v1
- ❌ Sub marketplace — added in v1 (this is the wedge, but needs v0 traction first)
- ❌ Excel/PDF schedule import with AI — added in v1 (needs sample data from organizers)
- ❌ Push notifications — added in v1
- ❌ Photo-to-score (snap the paper scoresheet) — v2
- ❌ Conversational AI scheduler ("build a 12-team round robin Tuesdays 7–10") — v2
- ❌ Social feed / partner finder / player profiles — v2
- ❌ Multi-sport beyond volleyball — never (or far-future)
- ❌ Court/venue booking commissions — far-future
- ❌ Native iOS/Android apps — only after PWA hits real ceiling

---

## 5. Tech Stack & Architecture

### Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15** (App Router) | SSR, server actions, great DX, Vercel-native |
| Language | **TypeScript (strict mode)** | Catch bugs at compile time; Claude Code is excellent at TS |
| Styling | **Tailwind CSS v4** | Utility-first; pairs with shadcn |
| UI components | **shadcn/ui** | Copy-paste components, fully customizable, matches the light/airy aesthetic |
| Database | **Postgres on Supabase** | Free tier, hosted, includes auth + storage |
| ORM | **Drizzle ORM** | Lightweight, SQL-first, excellent TS inference |
| Auth | **Supabase Auth** | Built into the DB; supports email + Google. Uses the new publishable/secret API key system (`sb_publishable_...` / `sb_secret_...`), not legacy anon/service_role keys. |
| Email | **Resend** | 3,000 free/month, great DX |
| Hosting | **Vercel** | Native Next.js, instant deploys |
| Forms/validation | **react-hook-form + zod** | Standard combo |
| Date/time | **date-fns** + **luxon** for timezones | Tournament scheduling needs proper TZ handling |
| Testing | **Vitest** for units, **Playwright** for E2E | Standard |
| Analytics | **Vercel Analytics + PostHog** | Free tiers; PostHog for product analytics later |

### Architectural decisions

- **Server Components by default.** Use Client Components only when necessary (interactivity, browser APIs).
- **Server Actions for mutations.** No REST/GraphQL API in v0. Server Actions colocated with the route or feature.
- **Drizzle schema is the source of truth.** No raw SQL in app code (migrations only).
- **No global state library** (no Redux, Zustand, etc.) in v0. URL state + React state is enough.
- **No tRPC.** Server Actions cover it.
- **Public pages are static-where-possible** (ISR for standings, revalidated on score entry).
- **Optimistic UI** for score entry — the captain sees the standings update before the round-trip completes.
- **Row-Level Security (RLS) in Supabase** is the authorization layer, not just app code. Defense in depth.

### Directory structure

```
/
├── app/                          # Next.js App Router
│   ├── (public)/                 # Unauthenticated routes
│   │   ├── l/[slug]/             # Public league page
│   │   └── t/[slug]/             # Public tournament page
│   ├── (auth)/
│   │   ├── login/
│   │   └── signup/
│   ├── (app)/                    # Authenticated app
│   │   ├── dashboard/
│   │   ├── orgs/[orgId]/
│   │   │   ├── leagues/
│   │   │   ├── tournaments/
│   │   │   └── settings/
│   │   └── my-matches/
│   └── api/                      # Webhooks only (Resend, Stripe later)
├── components/
│   ├── ui/                       # shadcn primitives
│   ├── league/
│   ├── tournament/
│   ├── scoring/
│   └── standings/
├── lib/
│   ├── db/                       # Drizzle client + schema
│   │   ├── schema.ts
│   │   └── migrations/
│   ├── scheduler/                # Pure functions: round-robin, pool gen, bracket
│   │   ├── round-robin.ts
│   │   ├── pools.ts
│   │   ├── bracket.ts
│   │   └── tiebreakers.ts
│   ├── auth/
│   ├── email/                    # Resend templates + send fns
│   └── utils/
├── server/
│   └── actions/                  # Server Actions, grouped by domain
├── types/
└── tests/
```

---

## 6. Sport Formats & Match Configurations

### Indoor 6s
- Roster: 6 on the court, up to 12 on a team
- Default match format: **best of 5 sets to 25, set 5 to 15, win by 2**
- Recreational variant: **best of 3 sets to 25**
- Time-capped variant (common in Toronto): **2 sets to 25 + 1 set to 15, capped at 60'**

### Beach 2s
- Roster: 2 players (no subs during a match)
- Default match format: **best of 3 sets to 21, set 3 to 15, win by 2**
- Tournament pool variant: **2 sets to 21 + tiebreaker to 11, capped at 45'** (matches OVA "2x15 + 1x11@45'" notation shown in reference)
- Best-of-1 to 25 variant for quick play

### Co-ed 4s
- Roster: 4 on court (typical 2M/2W), up to 8 on a team
- Default match format: **best of 3 sets to 21**
- Time-capped variant: **2 sets to 21 + 1 set to 15, capped at 50'**

### Match format data model
A match format is configurable per league/tournament, with these fields:
- `bestOf`: 1 | 3 | 5
- `setsToPoints`: array of points needed per set (e.g., `[25, 25, 15]` for bo3 with deciding set to 15)
- `winBy`: usually 2
- `capMinutes`: optional time cap
- `tiebreakerSetTo`: optional alternate set 3 score (e.g., 11)

This lets us represent any volleyball match format without hardcoding.

---

## 7. Scheduling Algorithms

### Round-robin (leagues)
- Input: list of teams, weekly time slot(s), number of courts, season start/end dates, blackout dates
- Output: a complete schedule where every team plays every other team **N** times (where N is configurable — usually 1× or 2×)
- Algorithm: **circle method** (Berger tables) — standard, well-tested, even distribution of matchups
- Constraints to respect:
  - No team plays twice in the same time slot
  - Court rotation balanced (no team always on court 1)
  - Bye weeks handled if team count is odd
  - Blackout dates skipped

### Pool play (tournaments)
- Input: list of teams, pool size preference (default 4), pool format
- Output: balanced pools and round-robin-within-pool schedules
- Algorithm:
  - Distribute teams into pools by seed (snake draft: 1→A, 2→B, 3→C, 4→D, 5→D, 6→C, …)
  - Within each pool: round-robin
  - Cross-pool matches if requested
- Court assignment: keep pools on adjacent courts when possible (referee crossover)

### Single-elimination bracket
- Input: teams seeded out of pools (by pool position + cross-pool tiebreakers)
- Output: a bracket of size = next power of 2 above team count (with byes for top seeds)
- Algorithm: standard seeding (1 vs 16, 8 vs 9, etc.)
- v0 supports single elimination only. Double elim and consolation brackets are v1.

> **v1 (in progress): Championship + Consolation brackets, pulled forward.** A
> tournament can now run two single-elim tracks — pools rank all teams, the top
> N seed a Championship bracket and the next M a Consolation bracket (organizer
> sets both sizes, reorders the seed preview, then generates). Stored as a
> selectable format template at creation (`tournament_settings.format_template`)
> + `matches.bracket_track`. **Drop a game:** an organizer may flag a pool as
> `needs_drop`; each team in it excludes one game (`teams.dropped_match_id`)
> from **its own** standings only — the dropped result still counts in full for
> the opponent. The exclusion is implemented per-team in `lib/scheduler/tiebreakers.ts`
> (so it flows through the OVA tiebreakers and bracket seeding unchanged).

### Implementation requirement
All scheduling algorithms must be **pure functions** in `lib/scheduler/`. No DB access. Take inputs, return outputs. This makes them trivially testable and reusable.

---

## 8. Tiebreaker Rules (Standings)

This is critical and a common place where apps cut corners. **Do not cut corners.**

The standard hierarchy used by OVA and most North American volleyball:

1. **Match wins** (descending)
2. **Head-to-head**: if a subset of teams are tied on match wins, look at matches won between *only those tied teams*. Recompute MW/MP ratio within the tied subset.
3. **Set ratio**: SW / SL across all matches (in the relevant competition)
4. **Point ratio**: PF / PA across all matches
5. **Coin flip / organizer decision** (last resort, displayed as "TBD" until resolved)

When two teams have the same record at step 2, but a third team is also involved, the head-to-head computation can produce circular results. In that case, fall back to step 3 (set ratio) **calculated only among the still-tied teams**, then step 4 among the still-tied teams.

### UX requirement
Tapping the position number on a standings row opens a modal showing exactly which tiebreaker step resolved the tie and the values used. Match the OVA app's style:

```
Sorting teams by (matches won / played) between all teams in the pool.
R.Kohl/T.Thomas: 3 / 3 = 1
A.Checinski/J.Bowmaster: 2 / 3 = 0.6666666666666666
D.Chadwick/K.Rakamnuaykit: 1 / 3 = 0.3333333333333333
A.Minyaylo/M.Dioso-Lopez: 0 / 3 = 0
```

Implement this as `lib/scheduler/tiebreakers.ts`, a pure function that takes teams + matches and returns an ordered list with an annotation of which step ranked each team.

---

## 9. Data Model

### Core tables (Drizzle)

```ts
// organizations
id, slug, name, logo_url, contact_email, owner_user_id, created_at

// users (managed by Supabase Auth, but mirrored)
id, email, display_name, avatar_url, phone, created_at

// org_members
org_id, user_id, role ('owner'|'admin'|'organizer'), created_at

// competitions (supertype for leagues + tournaments)
id, org_id, slug, name, type ('league'|'tournament'),
sport ('indoor6'|'beach2'|'coed4'),
status ('draft'|'open'|'scheduled'|'in_progress'|'completed'|'cancelled'),
start_date, end_date, venue, timezone,
match_format JSONB (see Section 6),
visibility ('public'|'unlisted'|'private'),
created_at

// league_settings (1:1 with competitions where type='league')
competition_id, weekly_slots JSONB, rounds_per_team INT,
blackout_dates DATE[], promotion_relegation BOOL

// tournament_settings (1:1 with competitions where type='tournament')
competition_id, pool_size INT, pool_format JSONB,
bracket_type ('single_elim'|'none' for v0), registration_deadline TIMESTAMP

// divisions (e.g., "16U Girls Premier", "Adult A")
id, competition_id, name, tier_order INT

// pools (tournaments only)
id, competition_id, division_id NULL, name, sort_order INT

// teams
id, competition_id, division_id NULL, pool_id NULL,
name, seed INT NULL, captain_user_id, created_at

// team_members
team_id, user_id, role ('captain'|'player'), jersey_number NULL,
created_at

// matches
id, competition_id, pool_id NULL, round INT NULL, bracket_position INT NULL,
home_team_id, away_team_id, scheduled_at TIMESTAMPTZ,
court VARCHAR, status ('scheduled'|'in_progress'|'completed'|'forfeit'|'cancelled'),
created_at

// sets
id, match_id, set_number INT, home_score INT, away_score INT,
created_at

// match_confirmations
id, match_id, captain_user_id, action ('submitted'|'confirmed'|'disputed'),
created_at

// match_audit (for edits after submission)
id, match_id, changed_by_user_id, change_summary TEXT, created_at

// standings_cache (materialized view, refreshed on score commit)
competition_id, pool_id NULL, division_id NULL, team_id,
mw INT, ml INT, sw INT, sl INT, pf INT, pa INT,
set_ratio NUMERIC, point_ratio NUMERIC, position INT,
tiebreaker_step INT, computed_at
```

### Key relationships
- `competitions` is the spine. Leagues and tournaments both live here, differentiated by `type`.
- `pools` are tournament-only; `round` on `matches` is league-only.
- Standings are **cached** (materialized) but computed by a pure function on every score commit. Never store standings as the source of truth — always recompute.

### Row-Level Security
- A user can SELECT a competition if it's `public` OR they're an org_member OR they're a team_member.
- A user can INSERT/UPDATE on matches/sets if they are captain of one of the teams in the match.
- A user can do anything on a competition if they're an `owner` or `admin` of the org.

Write the RLS policies as part of the initial Drizzle migration.

---

## 10. User Flows (v0)

### F1 — Organizer creates a league
1. Sign up → land on dashboard
2. Create an organization
3. "New Competition" → choose **League** → choose sport (indoor 6s / beach 2s / co-ed 4s)
4. Fill: name, season dates, weekly slot, venue, # courts, # divisions, # rounds per team
5. Add teams (name + captain email)
6. Captains receive invite emails to claim their team
7. Click "Generate Schedule" → schedule appears
8. Click "Publish" → competition is now `open` and public URL is live

### F2 — Captain enters a score
1. Open app → "My matches" tab
2. See current match marked as "in progress"
3. Tap → set-by-set entry form
4. Submit → other captain notified
5. Other captain confirms (or disputes)
6. Standings update across the competition
7. If disputed, organizer gets a notification and resolves in admin view

### F3 — Player views their schedule
1. Click captain's invite or get added by captain
2. Sign up → automatically joined to their team
3. "My matches" shows upcoming matches with venue, court, opponent, time
4. Tap any past match to see scores

### F4 — Organizer runs a tournament
1. "New Competition" → **Tournament** → pick sport
2. Set date, venue, courts, registration deadline
3. Define divisions (e.g., AA, A, BB, B)
4. Open public registration → teams sign up via public URL
5. Close registration → set pool size and click "Generate Pools"
6. Pools shown; seed teams (drag/drop or auto-seed)
7. Click "Generate Schedule" → pool schedule appears
8. Day-of: scores come in, pools resolve
9. Click "Generate Bracket" → single-elim bracket auto-seeded by pool finish
10. Bracket fills out as matches complete

### F5 — Spectator views a tournament
1. Hits public URL (e.g., `/t/toronto-sand-classic-jul`)
2. Sees: pools tab (with live standings), schedule tab, brackets tab, "my matches" only visible if logged in
3. No login required for any of this

---

## 11. Design System

**North star**: CBVA's clarity. Light, airy, fast.

### Visual tokens

- **Background**: white / very light gray (`#FAFAFA`)
- **Surface**: white with soft shadow
- **Primary**: a confident, friendly blue (`#0EA5E9` or similar — final pick in Phase 1)
- **Accent**: warm sand/beach-volleyball tone for tournament UI (`#F59E0B`)
- **Text**: near-black (`#0F172A`), with `#475569` for secondary
- **Borders**: subtle (`#E2E8F0`)
- **Success / Warn / Error**: standard Tailwind palette
- **Dark mode**: not in v0; add post-v0 with a toggle

### Typography

- Sans: **Inter** (UI), via next/font for performance
- Numeric: **tabular figures** for standings tables (`font-variant-numeric: tabular-nums`)
- Sizes: stick to Tailwind's defaults; default body is `text-base` (16px) on desktop, `text-sm` on mobile

### Components & patterns

- Use **shadcn/ui** primitives. Don't reinvent buttons, dialogs, dropdowns.
- Standings table: tabular numerics, hover row highlight, position number is a clickable button (opens tiebreaker modal).
- Match cards: avatars/initials for teams, score in big numerals on the right, status pill ("Scheduled" / "Live" / "Final").
- Public pages: hero with competition name, then tabs (Schedule, Standings, Brackets, Teams).
- Mobile: bottom nav with: Home, Schedule, Standings, Profile.

### Motion

- Subtle transitions (Tailwind defaults).
- Score updates animate in (use `framer-motion` only if needed).
- No flashy stuff. Restraint is the brand.

---

## 12. Build Phases (Claude Code sessions)

Each phase is roughly one focused 2–3 hour session. Commit before moving on.

### Phase 0 — Scaffolding
- `create-next-app` with TS, Tailwind, App Router
- Install shadcn/ui, Drizzle, Supabase client, Resend, Zod, date-fns, luxon
- Set up env vars, `.env.example`, Supabase project
- Configure ESLint, Prettier, Husky pre-commit
- Push to GitHub, connect Vercel

### Phase 1 — Data model & migrations
- Write the complete Drizzle schema (Section 9)
- Generate the first migration
- Write seed data: 1 fake org, 1 fake indoor 6s league with 8 teams + 8 weeks of fake matches, 1 fake beach 2s tournament with 12 teams across 3 pools
- Write the RLS policies
- Verify in Supabase Studio

### Phase 2 — Auth & org setup
- Wire Supabase Auth (email + Google)
- Login / signup pages
- "Create organization" flow
- Org switcher in the navbar (for users with multiple orgs)
- Profile page (name, avatar)

### Phase 3 — Scheduler primitives (pure functions, no UI yet)
- `lib/scheduler/round-robin.ts` — circle method
- `lib/scheduler/pools.ts` — snake-draft pool assignment + within-pool round robin
- `lib/scheduler/bracket.ts` — single-elim seeding
- `lib/scheduler/tiebreakers.ts` — full hierarchy with annotation of resolving step
- Unit tests for all four (Vitest) — at least 10 test cases each, including edge cases (odd team counts, 3-way ties, byes)

### Phase 4 — League creation
- "New League" wizard (multi-step form with react-hook-form + zod)
- Add teams + invite captains by email
- Captain invite flow (claim a team via signed link)
- "Generate Schedule" button — calls the scheduler from Phase 3
- Schedule view (calendar + list)
- Manual drag-to-reschedule
- Publish toggle (draft → open)

### Phase 5 — Tournament creation
- "New Tournament" wizard
- Public registration page (team name + 2 player emails for beach, more for indoor/coed)
- Divisions UI
- "Generate Pools" + manual seed adjustment
- "Generate Schedule"
- Public tournament page (tabs: Pools, Schedule, Brackets, Teams)

### Phase 6 — Score entry & confirmation
- "My matches" page for captains
- Set-by-set entry form (numeric inputs, mobile-friendly)
- Submit → record in `match_confirmations`
- Notify other captain via Resend
- Confirm/dispute flow
- Optimistic UI updates

### Phase 7 — Standings & tiebreakers
- Standings table component
- Live recomputation on score commit (via Drizzle + Phase 3 functions)
- Tiebreaker modal (OVA-style)
- Standings on public competition pages

### Phase 8 — Brackets & playoffs
- "Generate Bracket" button (tournaments)
- Bracket view (visual tree, mobile-scrollable)
- Auto-advance winners
- Final placement

### Phase 9 — Emails & notifications
- Resend templates: weekly digest, confirm-needed nudge, schedule-changed, results
- Cron job (Vercel Cron) for Sunday digest
- Notification preferences in profile page

### Phase 10 — PWA polish
- `manifest.json`, icons, install prompt
- Offline read-only via service worker
- App icon, splash screen
- Mobile bottom nav
- Loading skeletons everywhere
- Empty states (illustrations or thoughtful copy)
- Production readiness: error boundaries, 404 page, /privacy, /terms

### Phase 11 — Soft launch readiness
- Deploy to a real domain
- Onboard 2 organizer friends as design partners
- Add a feedback widget (PostHog or simple form)
- Write a one-page landing site

---

## 13. AI (post-v0 — included for context)

These features are NOT built in v0 but the schema should not preclude them:

- **Excel/PDF import**: Anthropic API parses uploaded files into a structured schedule preview. Organizer confirms before commit.
- **Conversational scheduler**: natural language → constraints → scheduler call.
- **Sub matching**: ranking subs by skill fit, position need, no-show history, distance.
- **Match recaps**: weekly LLM-generated digest from results.
- **Photo-to-score**: vision model reads a scoresheet photo.

The Anthropic API key will be added to env vars when these phases begin.

---

## 14. Monetization (post-v0 — for context)

- **Free for organizers, always.**
- Player registration fee: **$1–2 per registration**, baked into the price players see.
- Stripe Connect for payouts to organizers.
- Optional premium player profile ($3–5/month) later.
- Sub-marketplace platform cut later.

---

## 15. Non-functional Requirements

- **Performance**: First contentful paint < 1.5s on 4G; standings recompute < 200ms.
- **Accessibility**: WCAG AA. Keyboard navigation. Semantic HTML. Proper labels on every input.
- **i18n**: English only in v0, but use a translation lib (`next-intl`) so French (Canadian) can land in v1 cleanly.
- **Time zones**: All timestamps stored as TIMESTAMPTZ. UI shows local time of the competition's venue.
- **Audit**: Every score edit logged in `match_audit`.
- **Backups**: Supabase handles DB backups; verify daily backup is on.
- **Privacy**: Don't collect anything we don't need. No tracking pixels. PostHog opt-out respected.

---

## 16. Open Questions (to resolve before/during build)

1. Brand name (TBD — leave as "Volleyball Platform" for code identifiers; final name applied in Phase 10).
2. Default tiebreaker hierarchy: confirmed OVA-style. Should organizers be allowed to customize? **Decision: not in v0.**
3. Should captains be able to delete a match score, or only edit until end of day? **Decision: edit until end of day, then organizer-only.**
4. Multi-language UI? **Decision: English only in v0; structure for i18n.**

---

## 17. Definition of Done for v0

The product is "done" with v0 when:

1. A real organizer in Toronto can create a league or tournament without any handholding.
2. Captains can submit scores from their phone in under 30 seconds.
3. Standings (with proper tiebreakers) update visibly within 2 seconds of a confirmed score.
4. A spectator can find any public competition's standings on their phone in under 3 taps from the homepage.
5. Three real organizers have used the app for a real competition end-to-end.

That's the bar. Below that we keep iterating; above that we move on to the sub marketplace.
