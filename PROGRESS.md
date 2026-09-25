# Progress

A log of what shipped each session. Newest first. Detail on current state and
gotchas lives in `HANDOFF.md`; this file is the "what happened when".

---

## 2026-09-25 — The Players tab says who can actually reach the league

The owner, on the Players list: _"Here add which player joined the platform and
is able to access the league"_.

Those are two questions, and merging them would have hidden the one that
matters. **Joined** is simply whether the row has an account. **Can reach the
league** is whether it appears when they sign in — which is decided by
`my_competitions` (built entirely on `team_members`) and `my_pool_signups`
(migration 0132, for people still waiting to be drafted).

**Somebody can fall between those two.** Placed on a team, with an account, and
no `team_members` row: `my_competitions` misses them because there is no roster
row, and `my_pool_signups` misses them because they are not `available`. They
sign in and the league is simply not there. Big Shoots has exactly one — Michael
Adam — the residue of the bug 0131 fixed, added to the pool after this morning's
backfill ran. A badge that only said "joined" would have shown him as fine.

So three states: **Not joined yet**, **Joined**, and **Joined · can't see it**,
the last in amber because it is the only one an organizer has to act on.

**No extra query.** `getPlayerDirectory` already builds rows from two loops, and
which loop produced a row IS the answer: the `team_members` loop by construction
has a roster row, and anything reaching the `free_agents` push does not, because
players with both were merged and `continue`d above. Recording that as
`hasRosterRow` costs nothing.

**The rule is pure and tested** rather than inline in the table — six cases,
including the placed-without-a-roster-row one and the check that a roster row
beats the sign-up status. It has three branches and one of them is a bug
indicator; that is not something to leave as a ternary in JSX.

**Tests:** 1646 across 129 files, up six. `tsc --noEmit` and eslint clean. No
migration — a derived column over data already loaded.

---

## 2026-09-25 — A season's worth of day tabs, trimmed to the ones anybody wants

The owner, on Big Shoots' public page in week 2 of 32: _"Its showing every
possible weeks schedule. Only show past and the next weeks schedule. The stats
and standings are great."_

Thirty-two chips, from Sep 18 to May 7, above the thing people opened the page
to read. Now: the nights already played, plus the next one still to come.
Everything beyond that appears as it gets closer, and **"All days" still reaches
the whole season** — the wall stops being the default, it doesn't stop existing.

**The cutoff IS `defaultScheduleDay`'s answer, deliberately.** That function
already decides which tab the schedule opens on — "the next night that hasn't
finished, today included". Writing a second rule that meant roughly the same
thing would let the two drift, and the failure would be the page opening on a
day that isn't in its own tab list. `currentSession` leans on it for exactly
this reason, so `visibleScheduleDays` does too. A test pins the invariant
directly: the day the schedule opens on is always present, and always last.

**Opt-in, because the component is shared.** `ScheduleView` serves the public
page, the organizer page, the team page and the embed. Somebody planning
February needs to reach February, so only the public page passes `visibleDays`;
everyone else keeps all 32.

**Three things kept deliberately intact.** `dayDates` stays complete, since
`activeDay` validates against it and `multiDay` derives from it — filtering the
source would make a link into a hidden night fall back to "All days" without
saying so. The selected day always renders, so such a link still shows its tab.
And the numbering comes from the full season, so Day 14 is the fourteenth night
whether or not the first thirteen are on screen; renumbering the visible ones
would make the same night change number as the season went on.

**The near miss worth recording.** My first version passed `hidden={...}` to
`DayTab`. That component destructures exactly `{ active, onClick, children }`
and spreads nothing, so the prop was silently discarded. `tsc` caught it here —
but had `DayTab` spread its rest props, this would have compiled, passed every
test, and trimmed nothing: a change that looks finished and does nothing. Not
rendering the tab at all is both simpler and immune to that.

**Tests:** 1640 across 128 files, up seven. `tsc --noEmit` and eslint clean. No
migration — this is pure date logic and a prop.

---

## 2026-09-25 — A pool card you can actually click (0134)

The owner, looking at his own dashboard: _"I cant click on this big shoot. If a
player is added to the list of players in that league, irrespective they play or
not or if they are a sub, they should be able to see the league. Click on it and
see the schedule, stats and such."_

**I made those cards non-links this afternoon, and my stated reason was wrong.**
The comment read: _"a drafted league is usually private, so the public page
would 404 for exactly these people."_ That is true of Mango's Friday league,
which I had just created as private, and I generalised from it without checking
the league actually in front of me. Big Shoots is **public**, and
`can_view_competition` admits a public competition outright — so all twelve of
its pool members could always have read that page, roster row or not. Verified
by assuming each of their identities in a rolled-back transaction: twelve
`can_view = true`, including Sean Gade, who is unplaced with no roster row.

Across every event, **all 14 pool sign-ups are on public competitions**, so
every card becomes clickable.

**The private case is still real, so the link is conditional.** A pool member of
a private drafted league is none of platform admin, org member, competition
admin or rostered, so that page would 404. Rather than trade a dead card for a
dead link, the title links only when the event is public and stays plain text
otherwise. Nothing hits that branch today; it exists for Mango's Friday league
once people are in its pool.

**`visibility` comes from the FUNCTION, not from client-side inference.** The
database already knows, and deriving the same permission twice is precisely how
a page and a server end up disagreeing — the bug that showed BVL's organizers a
read-only schedule while the action behind it would have accepted their scores.
0134 drops and recreates `my_pool_signups()` to return it; a function's RETURNS
TABLE signature cannot be changed in place.

**What this did NOT need:** a policy change. My first instinct was a migration
extending `can_view_competition` to admit `free_agents` rows, which would have
widened read access on every private competition on the platform. Checking the
actual league first turned a policy change into a link.

**Noticed in passing:** Michael Adam is placed on a Big Shoots team with no
`team_members` row — one straggler from this morning's 0131 backfill, presumably
added to the pool after it ran. Worth a re-run of
`backfill-0131-claim.ts --write`.

**Tests:** 1633 across 127 files, unchanged — this is a query column and a
conditional link. `tsc --noEmit` and eslint clean. 0134 applied and verified
before the code that reads it.

---

## 2026-09-25 — BVL's Reverse Pairs night, and a cap on what one game can swing (0133)

Set up tonight's event at Notre Dame: 14 pairs, 2 courts, first game 7:30pm,
timed games of about 16 minutes.

**I got the scoring wrong twice before getting it right, and both corrections
came from the owner.** First I read "10 points max per game" as games played to
10. It isn't: these are TIMED games, so a score can be 35-20, and the 10 is a
cap on the MARGIN each game contributes to the standings. Then I offered a
9-round night because it got closer to the seven games Theresa asked for — and
was told flatly that everyone plays the same number of games, which is what the
scheduler's own header already says: _"Sitting out one more game than the pair
next to you is the complaint that ends a night."_ I had read that comment and
offered the uneven option anyway.

**The cap did not exist.** `reversePairsStandings` summed raw differentials with
no clamp. Uncapped, one blowout decides the night — BVL has a +37 on record,
worth more than five close wins and mostly a statement about who you were drawn
with. 0133 adds `reverse_pairs_settings.point_cap`, nullable so every night
already played scores exactly as before.

**Only the ranking is capped.** `pointsFor` / `pointsAgainst` stay raw, because
those are points actually scored and capping them would misreport the game to
the people who played it; `won`/`lost` are untouched, because a win is a win at
any margin. Eight tests, including one that proves the cap reorders a field: the
same six pairs, one 40-10 massacre and three close defeats, tops the table raw
(+8) and bottoms it capped (-12).

**A fixture of mine failed and deserved to.** I asserted a table ordering
without computing it — the pairs who won the blowout and then never played again
sat on +30 while the pair I named had dropped to +15. Same mistake as the Tier 5
margins earlier in this session. Rebuilt so the six pairs stay together all
night and the arithmetic is written into the comment.

**The draw action hardcoded a 7:00pm start.** It now reads
`competitions.start_time`, falling back to 19:00. Without that, anyone pressing
Redraw tonight would have silently moved all 14 games half an hour earlier —
discovered by players arriving at an empty gym.

**Seven rounds, and the arithmetic is the whole argument.** Three pairs a side
means six pairs a court, so two courts hold twelve and two sit out each round.
Games per pair is `12 × rounds ÷ 14`, whole only when rounds is a multiple of 7.
Seven rounds = 14 games = 84 appearances = **six each exactly**, with 14
bye-slots over 14 pairs so everybody sits out precisely once. Exactly seven each
is impossible for anyone to arrange: every game consumes exactly 6 pairs, so
total appearances is always a multiple of 6, and 14 × 7 = 98 is not.

**The draw:** 2 repeat partnerships across the night, 82 distinct partnerships
of 91 possible, every pair with 11 or 12 distinct partners against a hard
ceiling of 12 (six games × two partners). Not the theoretical floor of 0
repeats — the annealer landed near it, not on it — and reseeding to chase two
partnerships would reshuffle everyone for nothing.

**Not done:** the cap has no UI. `updateReversePairsSettingsAction` doesn't
carry `pointCap`, so it is currently only settable by SQL. Saving the settings
form will not wipe it — that update names its columns and omits this one.

**Tests:** 1633 across 127 files, up eight. `tsc --noEmit` and eslint clean.
0133 applied and verified before the query that reads it.

---

## 2026-09-25 — "You're in the pool for this league" (0132)

The owner, on the gap I had named an hour earlier rather than closed: _"Can you
fix the pool visibility for unplaced players too"_.

**The hole.** Somebody signs up on their own, or an organizer adds them, and
they wait to be drafted. They have no team, so `my_competitions()` — built
entirely on `team_members` — returns nothing, and the dashboard told them: _"ask
your organizer to add you to a team — you'll see your competitions here."_ Their
organizer had already added them. That exact line is what Big Shoots' players
were staring at.

**It was never a Big Shoots edge case.** Applying it reported **13 linked
players across 5 leagues** who will now see where they stand — twelve of them
BVL's, one Big Shoots. BVL's individual registrants have been signing up and
being shown nothing, and nobody reported it; Liam only noticed because he had
just added a batch and asked them.

**Why a function and not a query.** The player can read their own `free_agents`
row (`user_id = auth.uid()`), but they also need the competition's NAME — and
`can_view_competition` admits a platform admin, a PUBLIC competition, an org
member, a competition admin, or somebody with a `team_members` row. A pool
member on no team in a private league is none of those, so a plain join returns
a nameless row. The same reason `my_pending_invites` is security definer: it
names competitions for people who are not members yet.

**Deliberately excluded:** `placed`, because since 0131 those people have a
roster row and appear under "Competitions you play in" — listing them in both
would read as two different things — and `withdrawn`, because they pulled out.

**Deliberately not a link.** A drafted league is usually private, so the public
page would 404 for precisely the people this section is for. A card that says
where you stand beats a link that refuses you.

**And the sentence itself is fixed.** "Ask your organizer to add you to a team"
now appears only when there is genuinely nothing — no invites, no competitions
AND no pool sign-up.

**Tests:** 1625 across 127 files, unchanged — no new pure logic; the rule is one
`where` clause in the RPC and the applier asserts it excludes placed players.
`tsc --noEmit` and eslint clean. 0132 applied and verified before the code that
calls it, because a missing RPC on the dashboard would break the page for every
signed-in user, not just these thirteen.

---

## 2026-09-25 — Linking an account was half the job (0131)

Big Shoots' organizer, hours after I shipped 0130: _"hey so I added their
emails, then some guys have created accounts, but they are all saying they
don't see anything when they log in"_. He forwarded the screen — "ask your
organizer to add you to a team" — to players who were already **on** a team.

**0130 was my half-fix and this is the other half.** It adopted a pool row by
matching email, set `free_agents.user_id`, and stopped. But the dashboard's
entire list is `my_competitions()`, which in every version since 0014 is:

```sql
from team_members tm join teams t on t.id = tm.team_id
where tm.user_id = auth.uid()
```

It **never reads `free_agents`**. And `place_free_agents` only writes a
`team_members` row for a player who ALREADY had an account, because
`team_members.user_id` is NOT NULL and a drafted player usually has none. Big
Shoots therefore had **4 teams and 1 `team_members` row** — a fact already
written down in `HANDOFF.md`, which I had read, and did not connect to the
feature I was building.

So linking changed nothing anyone could see. Six people with accounts, five of
them placed on teams, logging in to be told to ask their organizer.

**0131:** when the adopted sign-up is placed, join the roster too — always
`'player'`, never `'captain'`, the same choice `accept_pending_invites` makes
for anyone arriving without a captain invite. Being drafted onto a team is not
a claim to run it.

**`backfill-0131-claim.ts` repaired the ones already stranded**, because the
function only ever runs for whoever is signed in and these people should not
have to log in again to be found. Report-only by default; `--write` to act. It
applies exactly the function's rule, including the skip for anyone who has
their own competing sign-up. Result: **6 linked, 5 rosters joined, 0 skipped**,
all Big Shoots. Verified after: linked 2 → 8, `team_members` 1 → 6, nobody left
stranded.

**A gap I am naming rather than hiding.** Sean Gade is linked but not placed on
a team, so he still sees nothing — the dashboard has no concept of "you are in
the pool for this league". That is a real hole for any drafted league between
sign-up and draft night, and it is not fixed here. Eighteen more Big Shoots rows
have no matching account yet; those link themselves on first dashboard load now.

**What I should have done:** checked what the dashboard actually reads before
shipping something whose entire purpose was to make a league appear on it. The
answer was one grep away, and `HANDOFF.md` already said Big Shoots had one
member row for twenty-four players.

---

## 2026-09-25 — Captains can read the pool before they pick (0130)

The owner: _"Can we create a draft screen as well that can be shown only to
Setters or Captains that Org marks? They should be able to see what players are
available"_.

**Captaincy already existed and was the wrong shape for this.**
`setCaptainAction` promotes a TEAM member — it needs a team, a roster row and an
account. At draft time the teams do not exist yet, because the captains are what
bring them into existence. So the mark goes on the pool as
`free_agents.is_captain`, and `team_members.role` is left exactly as it is: one
says who may pick, the other who runs a team that already exists.

**`draft_pool()` is a function, not a widened policy, and that is the point.**
A `free_agents` row carries an email, a phone number, free-text organizer notes
and a self-assessed grade — and 0076 said plainly that the grade is "exactly the
sort of thing nobody wants published next to their name". A captain needs names,
positions and the grade to pick a balanced side; they get those and nothing
else. RLS is row-level and cannot withhold a column, so the only way to expose
part of a row is a `security definer` function. The applier asserts it: it reads
the live function's return signature and fails if `email`, `phone` or `notes`
appear in it.

**Adoption, because an organizer's list is not a set of invites.** Roger types
eighteen names in; those rows have no account. `claim_free_agent_signups()`
mirrors `accept_pending_invites` (0054/0058/0062) — same shape, run in the same
place on dashboard load — and adopts rows whose email matches the caller's own
verified address. Following 0062's reasoning, there is no token and no expiry:
it only ever matches the caller's own email, so auth has already proved who they
are.

**The collision is the part worth reading twice.** `free_agents_one_per_user` is
`unique (competition_id, user_id)`, and NULLs are distinct, so hand-added rows
coexist happily. But somebody who ALSO signed themselves up has their own row,
and adopting the organizer's would violate it. The claim skips that competition
and leaves both rows for the organizer to merge — a duplicate somebody can fix
beats a claim that errors and links nothing. That case is real, not theoretical:
`register_individual` upserts on `(competition_id, user_id)` and cannot see a
null-user row with the same email, so it will happily create the second one.

**Two RLS traps avoided in the page.** Access is checked by reading the caller's
OWN free-agent row — allowed by `free_agents_select`'s `user_id = auth.uid()`
arm — rather than inferred from the RPC coming back empty, because a genuinely
empty pool must not look like a permission failure. And the competition row
itself may be unreadable: a drafted league is often private, and a captain who
is no team's member cannot read it. The heading falls back instead of the page
failing, and team names are not resolved at all for the same reason.

**Read-only, deliberately.** The ask was to see who is available and choose
wisely. Picking here would need a turn order, a lock, and a rule for two
captains taking the same player in the same second — a different feature.

**A marked captain with no account is told so at the moment of marking**, since
they cannot sign in and would see nothing. 25 rows across the org are currently
waiting on an account.

**Tests:** 1625 across 127 files, unchanged. No new pure logic — the rules live
in the two RPCs and in existing RLS, and the applier verifies them against the
live database instead. `tsc --noEmit` and eslint clean. 0130 applied and
verified: 45 rows, 0 captains, nothing changed for anyone yet.

---

## 2026-09-25 — Add a player from the Players tab, by searching who you already run

The owner, looking for the thing I had just shipped: _"In the players tab there
isnt any space to add the players by the organiser. They could already be part
of the other league. So let the org find the players by email and add them
directly. If it doesnt exist then let him add name and email."_

Two separate failures, and the first was mine. **The panel went on the Teams
tab.** `FreeAgentsCard` renders when `allowIndividualSignups || freeAgents.length
> 0`, so it was there and reachable — just not where an organizer looks for
players. And **the Players tab's empty state was a dead end**: "Players appear
here as teams fill up", with nothing to act on.

**The button is in `CardHeader`, not `CardContent`.** The content
short-circuits when nobody is registered, which is exactly the moment somebody
needs to add the first person. Putting it in the content would have rebuilt the
dead end one level down.

**Searching sign-ups alone would have found nobody.** Both Mango leagues are
team-entry with zero free agents; the eighteen people Roger wants are rostered
accounts in the Coed Fall league. So the search unions `free_agents` with
`team_members` across every competition the org runs. Building it over the
individual pool — the obvious table — would have shipped a search box that
returned nothing for the one organizer it was built for.

**No migration.** `free_agents_select` admits `is_competition_admin`, which
resolves org-level organizers (0029/0043), and `users_select` admits
`administers_team_member` (0059) — an organizer may read the account of anyone
rostered in a competition they run. RLS scopes the whole thing to the caller's
own orgs without a line of checking here.

**The client sends an identifier, never a person.** Name, email, positions and
grade are re-read server-side from the org's own records, so a crafted request
cannot invent somebody or attach an arbitrary email to them, and cannot reach an
account the caller doesn't administer. There is deliberately **no platform-wide
lookup**: being able to type an email and learn whether it has an account is not
a power an organizer should have.

**The account is linked after the insert.** `organizer_add_individual` always
writes `user_id = null`, which is right for a name off a list and wrong for
somebody we just matched to an account — their appearances would key on a
spelling of their name instead of on them. Best-effort: the sign-up exists
either way.

**Merging fills gaps rather than overwriting**, because neither source is
complete. A roster sighting knows the email and not the positions; a free-agent
row from last season knows the positions and the grade. `personKey` is
deliberately NOT `attribution.ts`'s `identityKey` — that one decides whose stats
are whose and must not move; this one decides whether two rows in a search box
are the same human, where being slightly generous is right.

**Tests:** 1625 across 127 files, up seventeen — the merge, the key precedence,
the exclusion of people already in the league, and the email-before-name
ranking. `tsc --noEmit` and eslint clean.

---

## 2026-09-25 — An organizer can put a player in the pool (0129)

Mango's new Friday league is drafted by three captains from eighteen names the
organizer already holds. The owner's ask was narrow and correct: _"I want the
org to be able go in and add players first and make sure he is able to add
positions to these players so the setters or captains can see who they are and
can choose their team wisely."_

**There was no way in.** `free_agents` has no INSERT policy — every insert goes
through a `SECURITY DEFINER` function — and the one built for this,
`organizer_add_individual` (migration 0090), **was called by nothing.** No
server action, no button, no direct insert anywhere in the app. Big Shoots' 27
players went in through a setup script, which is why the gap never showed.

**And the function itself was broken.** 0090 inserts
`lower(btrim(coalesce(_email, '')))` — an empty string when given no email.
0091 later made the column nullable and added:

```
free_agents_email_shape:
  CHECK (email IS NULL OR email ~ '^[^@[:space:]]+@[^@[:space:]]+$')
```

`''` is present, so it is checked, and it matches nothing. The organizer-add
path raised a check violation for exactly the players it exists to serve — a
name on a list with no address. 0090's own header says it is for "a roster of
twenty-seven names already agreed"; it could not have added one of them.
Confirmed against production before writing the fix: 45 `free_agents` rows, 2
null emails, **zero** empty strings — nothing had ever used it. 0129 is one
`nullif`.

**The panel goes in the EMPTY state too**, and that is not a detail. The card
early-returns an entirely different `Card` when nobody has signed up — which is
precisely where an organizer with a brand-new league starts. Wiring the button
only into the populated view would have left Roger looking at "Nobody has signed
up on their own yet" with no way to act on it. It also stays open after each
save: eighteen names is eighteen rounds of that form, and the level usually
repeats down a list, so only the person clears.

**Positions lead the form** because they lead the board: the pool is grouped
into position columns, and that grouping is the thing a captain actually reads
when picking. They are validated against the sport exactly as sign-up validates
them — free text would file someone in a column of one that nobody looks at.

**The league is created** — draft and private, as the wizard would, with no
schedule. Fixtures follow the draft and the playoff pairings follow week 1, so
generating either now would be guessing. `rounds_per_team = 2` is precisely the
organizer's six games (three teams, each pair twice), `games_per_week = 4` is
what each team plays on the night, one court because only one game can be on at
a time, and `session_nights = 2` marks every second played night a playoff.

**What this does NOT give him, and he should hear it from us rather than find
out:** captains cannot draft themselves — that is organizer-only, so Roger
enters their picks; drawing cycle 2's playoff would delete cycle 1's playoff
games and scores; and season standings add up across re-drafts, so from cycle 2
"first place" means little. Those are the builds, in that order.

**Tests:** 1608 across 126 files, unchanged — this adds a server action and a
form, with the rules living in the RPC and the existing sport config rather than
in new pure logic. `tsc --noEmit` and eslint clean. 0129 applied and verified.

### The league page threw, and it was the setup script

Minutes after creating it, the league page returned a server-side exception.
Mine, and it took down the page the organizer was meant to use that night.

`setup-mango-friday.ts` bound `${JSON.stringify(MATCH_FORMAT)}::jsonb`.
**postgres.js already JSON-encodes a parameter bound to a jsonb target**, so the
value was encoded twice and stored as a jsonb STRING scalar rather than an
object — `"{\"winBy\":2,…}"` where every other league holds `{"winBy":2,…}`.
Same for `weekly_slots`.

That is fatal rather than cosmetic: `getLeagueDetail` reads
`(settings?.weekly_slots as WeeklySlot[])?.[0]`, and indexing a *string* yields
the character `"["`, so the slot has no `startTime` and the render falls over.
Only this league was affected; nothing else was touched.

**The script's own read-back printed it and I skimmed past it.** It looked
right, because `JSON.stringify` of a string renders as an escaped string and the
escaping is the only tell. The diff against a working league is what made it
obvious, side by side. The lesson is to verify a created row with
`jsonb_typeof`, not by eyeballing values that will look plausible either way.

Repaired with `(col #>> '{}')::jsonb`, guarded on `jsonb_typeof(col) = 'string'`
so a correct row could not be damaged and the fix is re-runnable. The setup
script now passes `sql.json(...)` and lets the driver encode once.

One useful accident: the repair's first run threw
`jsonb_typeof(date[]) does not exist` — `blackout_dates` is a `date[]`, not
jsonb — and because that was in the probe SELECT rather than the UPDATE, it
aborted before writing anything.

---

## 2026-09-24 — Individuals get asked the league's questions too

BVL's organizer, forming teams from the individual pool: _"is there any way to
have their gender listed? I have to make teams of equal M to F ratio, and I
can't tell sometimes based on names alone."_

They were already asking. **Gender** is a REQUIRED player question on all four
BVL leagues (Male / Female / Non-Binary). The answer rates are the whole story:

| League | Team roster | Free agents |
| --- | --- | --- |
| Non-Spiking (Tue) | 80/83 · 96% | 0/2 |
| Reverse 4s (Tue) | 33/33 · 100% | 0/1 |
| Spiking 6s (Thu) | 192/193 · 99% | 1/7 |
| Women's (Wed) | 69/73 · 95% | 2/7 |

374 of 382 rostered players answered. 3 of 17 free agents did. That is not
people declining — **the individual sign-up form never asked.**
`IndividualSignupForm` rendered name, email, phone, positions, level and notes,
and nothing else. The register page loads `playerQuestions` and handed them
only to the team paths. The one other screen that asks, `PlayerDetailsForm`, is
gated behind an outstanding WAIVER on the dashboard, so an individual with no
waiver obligation never met it — which is most likely how those 3 answered.

So the request was really two things, and doing only the visible half would
have been the worse outcome: showing gender on the draft board today would have
printed blanks against 14 of 17 real people. Same shape as the placeholder bug
higher up this page — a screen that looks filled in and isn't.

**Answers are saved BEFORE the sign-up, and before payment.** The other order
is exactly the bug: a sign-up exists, the answers don't, and nothing ever asks
again. It also means nobody reaches a Stripe checkout before the organizer's
questions have been put to them — the owner's own call when we scoped it.

**Enforced server-side, not just in the form.** `registerIndividualAction` now
calls `unanswered_player_questions` (migration 0104) and refuses while any
remain. That is the same rule and the same implementation the waiver gate uses,
rather than a second one that could drift. No migration: the RPC already
existed and already defaults to the signed-in user, so it cannot be pointed at
anybody else.

**It binds self-serve sign-ups only, which is the point.** An organizer
transcribing a roster goes through `organizer_add_individual` (migration 0090),
untouched here. They cannot answer a question about a person on that person's
behalf, and a guest with no account cannot hold answers at all — they are keyed
on `user_id`. Checking who called `registerIndividualAction` before adding the
gate was the difference between a fix and an outage on the draft screen.

**`missingRequired` moved to `lib/registration/required-answers.ts`** with ten
tests. It had none, and it has just become the client half of a rule the
database enforces: if the two disagree, a player either fills in everything and
is refused by a sentence naming no field, or is blocked on something the
database would have allowed. `question-fields.tsx` re-exports it so the three
existing consumers were not touched.

**Still outstanding:** the 17 existing sign-ups have no answers and nothing
backfills them — inventing a gender is not available to us. They can be filled
in from the organizer's Players tab (which already edits league questions for
anyone with an account, and all 17 have one), or the player can re-save their
own sign-up. And the draft board still does not DISPLAY the answer; that is the
small half, and it is worth doing once the data is actually there.

**Tests:** 1608 passing across 126 files, up ten. `tsc --noEmit` and eslint
clean.

---

## 2026-09-24 — A gym's court count belongs to the gym (0128)

The owner, looking at BVL: _"I want the org to be able to add the total courts
when adding a venue. So we dont need to have them add them again in each and
every league."_

He is right, and the storage was always half-way there. `LeagueCourt` has
carried a `venueId` since 0071, and `court-counts.ts` already says the quiet
part — _"A gym has a number of courts. So the count is the thing edited, and the
court rows are derived from it."_ But the number lived on the LEAGUE: either
`weekly_slots[].courts` as one figure for the whole competition, or a
`court_list` grouped by venue. Both describe one season's use of a building, so
an org running eight gyms retyped the same facts every league — four a season
for BVL, who rotate gyms weekly.

**`venues.courts`, nullable.** Null means "not stated", which is all 26 existing
venues, and every league falls back to its own number exactly as before. A
`not null default 1` would have asserted that two dozen real gyms have a single
court each — and the generator believes what it is told, wrapping court numbers
and double-booking a gym all night behind a schedule that looks fine.

It is a **default, never an override**. An org with a four-court gym may
deliberately use two of them on a Tuesday; the league's own court list is where
that gets said, and it still wins.

**Not yet wired: leagues do not read it.** That is the half the request was
actually about, and it is a design decision rather than a line of plumbing. The
seam is `venueCourts` in `server/actions/leagues.ts` — a map of venue to court
LABELS, which `labelFor` indexes into to name each court. Seeding it from a bare
count means generating labels ("1".."4"), and whether those should be numbers,
or letters, or inherited from a sibling league, is the organizer's vocabulary,
not mine to guess at the end of a change. Recorded in `HANDOFF.md`.

**For BVL specifically**, nothing changes until someone types the numbers: their
four 2026/27 leagues each run a single slot at `courts: 3`, with no court list,
no divisions, and `competitions.venue` still "TBD". The four gyms are on file
(Jim Archdekin, Notre Dame, St. Marguerite d'Youville, Terry Miller).

**A test caught what the suite could not.** `tsc` flagged the one other place a
`VenueSummary` is built — a fixture in `tests/venues/resolve.test.ts` — while
the suite ran 1598 green, because vitest does not typecheck. Second time today
that passing tests were not evidence the code compiled.

**Tests:** 1598 passing across 125 files, unchanged — this is data plumbing, and
`court-counts.ts` already owns the pure logic. `tsc --noEmit` and eslint clean.
Migration 0128 applied and verified: nullable integer, sanity check, 26 venues
all reading "not stated".

### Same day: the first real user found two holes in it

BVL added seven venues within hours. Only three kept a court count.

**A placeholder that looks like a default IS a default.** The field carried
`placeholder="3"`. Greyed placeholder text is indistinguishable from a typed 3,
so the organizer read the box as already filled, saved without touching it, and
we stored null. He diagnosed it precisely without seeing the code: _"if I change
the number of gyms from 3 to anything else, OR change it from 3 to 2, then back
to three, then save, the # of gyms will appear."_ Typing is what turns the
placeholder into a value. It now reads "Not stated" — words cannot be mistaken
for a number.

**The copy promised a feature that does not exist.** The same block said
_"Leagues played here start from this number instead of asking again."_ They do
not: the inheritance half was deliberately left unwired that morning, and the
seam is still `venueCourts` in `leagues.ts`. Shipping the honest caveat to
`HANDOFF.md` while the UI told organizers the opposite is the worse half of that
mistake. The field hint and the card description now claim only what is true
today.

## 2026-09-23 — A ladder game now records its tier, and an undo cleans up after itself

Mango's owner: _"Is there something wrong with our scheduler? The org asked
specifically to have tiers 1,3,5 at 7pm and 2,4,6 at 9pm. Week 2 doesnt look
like its aligned."_

**Nothing was wrong with the scheduler.** Attributed against the ladder that
existed when the draw ran, week 2 is exactly the grid the organizer asked for —
tiers 1/3/5 at 19:00, 2/4/6 at 21:00, one tier per court, zero cross-tier games.
The timestamps tell the real story: week 2's fixtures were written at **09:04**
and week 2's placements at **21:10**. The night was drawn, and the ladder
beneath it was rewritten twelve hours later by the re-lock. The fixtures still
pair teams by the ladder they were drawn from.

**Two fixes, both aimed at how long that took to see.**

**`matches.division_id` is now set when a ladder week is drawn**, on both the
per-tier and shared-packing paths. It was deliberately left null, on the
reasoning that "a game's tier is implied by its teams" — true for exactly as
long as nobody moves, which in a ladder is one week. After a promotion the same
fixture reads as belonging to whichever tier its teams landed in, so every
question about a drawn night has to be answered by inference. That inference is
what made me wrong twice here: I reported eight cross-tier games and a broken
draw, when the games were internally consistent and only my attribution was
stale. `planLadderWeek` had carried `divisionId` on every match all along —
nothing was ever written down.

**Unlocking now deletes the next week's fixtures along with its placements.**
They are derived from precisely the rows being removed, so leaving them behind
produces a schedule that is internally consistent and completely wrong, with
nothing on screen to say so. Guarded: if that week already has results, the
undo refuses rather than discarding scores — losing a played night to a button
meant for "I locked too early" would be the worse accident.

**Historical rows keep their null `division_id`.** Nothing backfills; weeks
already drawn stay as they are unless someone asks.

**Tests:** 1598 passing across 125 files, unchanged — neither fix touches pure
logic, and these are Server Actions, which need a test Supabase instance this
repo doesn't have. `tsc --noEmit` and eslint clean. No migration:
`matches.division_id` already existed (0123) and was simply never populated
here.

## 2026-09-23 — Head-to-head first, and a dropdown that had been lying

Mango's organizer, on who goes up when a tier finishes level:

> _"Can we do head to head first and if there is a tie then points … For
> example, your team and kochi yesterday. Tied 3-3. But you beat them by 1
> point. Head to head."_

**Traced before promising anything.** `lockLadderWeekAction` reads
`league_settings.tiebreaker`, hands it to `rankLadderNight` → `rankStandings`,
and `applyLadderMovement` promotes the top of that order. So the setting decides
who is promoted, not merely what the table shows. The one path that could have
bypassed it — a typed-in `result_rank` — is filled **nowhere on the platform**
(0 rows) and the lock has no branch for it.

**The discovery that mattered more than the feature.** The settings dropdown
read "OVA — match wins → **head-to-head** → set ratio → point ratio", and
`schema.ts` said the same. The code has always resolved head-to-head LAST, and
a test named "ratio beats head-to-head (the owner's rule)" pins it deliberately.
So the UI had been describing the opposite of the behaviour, to the one person
who reads it when answering an organizer's question. Both are corrected.

**`headToHead` mode:** match wins → head-to-head → set ratio → point ratio. The
hierarchy now lives in one `STEP_ORDER` table rather than being spelled out in
`if (step === …)` branches, so `explain()` reads the same table the ranking used
and cannot describe a different order from the one applied.

**The real risk was never the maths.** `lockLadderWeekAction` CASTS the stored
string straight to `RankMode`, while every display path decoded it with
`startsWith("differential") ? … : "ova"`. A new value would therefore have been
honoured when promoting and silently downgraded on screen — promotions and
standings disagreeing, which is worse than either rule alone. One
`parseRankMode` now serves every reader, and it also handles the `_projected`
suffix that the projection setting rides on.

That suffix was already breaking something: `team-view.ts` compared
`=== "differential"`, so a league using the projection ranked on differential
while its table showed ratio columns. Fixed by the same decoder.

**Tests:** 1594 passing across 125 files (7 new); `tsc --noEmit` and eslint
clean. No migration — `tiebreaker` is free text with no check constraint.

**Second pass, same day — head-to-head needed two levels.** Switching Mango to
the new mode changed nothing, which was the clue that "head to head" had been
read too narrowly. Kochi and Beijing had won one game each, so head-to-head was
level and fell straight through to ratios. What the organizer meant:

> _"in the 2 games Beijing and kochi played, beijing came in on top by 1 point.
> And they need to be top."_

The margin across the pair, not who won more of them. So the mode now resolves
**wins → head-to-head wins → head-to-head point difference → point ratio**, and
`headToHeadTable` carries `pointsFor`/`pointsAgainst`/`pointDiff` alongside the
wins it already counted. Difference, not points scored, confirmed by the owner
against the case that separates them — Tier 5 had all three teams on 2 wins,
where Mangalore scored the MOST points (90) and had the WORST margin (−4).

`ova` is untouched: head-to-head stays its final step, with no points pass, so
the other thirteen leagues rank exactly as before.

**Two tests failed on the way, and only one was the code's fault — neither.**
One was a `toEqual` pinning the old four-field `HeadToHeadEntry`, widened to
`objectContaining` because the row simply learned new fields. The other was my
own fixture: I had asserted the real Tier 5 margins over six invented matches
that did not produce them. Rebuilt from the scores as played, which is what the
assertion always claimed to be about.

**What it actually changes for Mango:** two moves, both at the Tier 2/3
boundary. Beijing Dragons go up instead of Kochi Knight Riders, and Dubai
Falcons drop instead of Osaka Onis — Osaka escaping by a +1 head-to-head margin
over Dubai (48 v 47). Tiers 4 and 5 are unaffected: the ties there were for
second place, which moves nobody.

**Tests:** 1598 passing across 125 files (4 more); `tsc --noEmit` and eslint
clean.

## 2026-09-22 — A misspelling became a second player, and subs got their own sheet

Big Shoots' organizer, three things at once:

> _"dave ended up playing on a different team and I fixed his spelling in the
> app — David Aitken* (so David Aitkin shouldn't exist anymore). … I'd like to
> have 1 stat sheet for our full time players. and then a sub stat sheet
> separated. … for the who has played with whom chart, don't want it to include
> subs, just need the combos for active players."_

**Why one person was two.** A player with no account IS their name —
`identityKey` is `n:<normalised name>`. He had three appearances spelled "David
Aitken" (Team 3, as a sub) and three absences spelled "David **Aitkin**" (Team
4). Two names, two identities, two rows: one carrying the games, one carrying
the missed night. He had fixed the spelling on the free-agent record at 15:24;
the absence rows, written at 15:15, kept the old one.

The three absence rows are deleted — the owner's call, since the correctly
spelled player already existed. Verified after: no `aitk` absences remain, his
three appearances intact, 36 absence rows down to 33.

**Renaming now carries through.** The organizer renamed him in the one place
the app offers, and it changed nothing downstream, which is what created the
phantom. `updateFreeAgentDetailsAction` now propagates a changed name into
`match_appearances` and `match_absences` — only for name-keyed players, since
an account-backed one is keyed on their id and their name comes from `users`.
Best-effort, like `recordAbsences`: the edit itself has already saved, and
failing it would report a lost correction that wasn't lost.

**Full-time is roster MEMBERSHIP, not how you played.** The organizer's rule:
"if a player is on an active roster when the teams were created they are a full
time player … rest all are subs that are replacing them for that night." Big
Shoots is 24 drafted of 27 signed up, six per team. Classifying on
`appearances.role` would have been the obvious shortcut and would have been
wrong for exactly one player — David, drafted onto Team 4, whose every
appearance is `role: "sub"` because he turned out for Team 3. The rule that
matters is the roster; the role on the night answers a different question.

`getFullTimeRoster` unions the same two sources `recordAbsences` already uses —
`team_members` for accounts, placed `free_agents` for everyone else. Reading
`team_members` alone would have reported a roster of **one** here and called 23
drafted players subs.

The stats tab now shows the drafted players, then a separate Subs table;
`getPartnerGrid` counts only drafted players, so the grid is combinations among
people who will actually be re-drafted. An undrafted league has an empty roster
and every row is flagged full-time, so it still shows one sheet rather than
filing a whole competition under "subs".

**A type that told the truth.** Adding a required `fullTime` to `PlayerStatRow`
broke two intermediate arrays inside `playerStatsByAppearance`, because the
answer isn't known until the roster loads. They are now
`Omit<PlayerStatRow, "fullTime">[]` rather than carrying a placeholder `false`
the compiler would have accepted and nobody would have questioned. Worth noting
the suite was green while those errors stood — vitest doesn't typecheck, so
passing tests were never evidence this compiled.

**Tests:** 1587 passing across 124 files (9 new); `tsc --noEmit` and eslint
clean. No migration.

**Follow-on, same day — Missed now follows the player too.** The owner, on the
principle behind all of this: _"Stats goes to players irrespective of what team
they play. Players could play for other teams if the org realizes they dont have
enough players. They shuffle. But stats are supposed to stay with players."_

`daysPlayed` already counted nights on court for ANY team. `nightsMissed` did
not: it forgave an absence only if the player appeared for the team that
rostered them, so someone shuffled to another side got `Days 1` and `Missed 1`
for the same night — credited for turning out and marked absent for it at once.

Worth recording that this **overturns a deliberate decision**, not an oversight.
The exact case was pinned by a test whose comment read "their own team still
needed covering, whatever they did elsewhere" — a defensible, genuinely useful
team-side reading. I put the conflict to the owner rather than quietly
redefining a column for the one organizer using it, and he chose the
player-centric meaning. The test is reversed and carries the reason; the column
hint no longer says "the times a sub had to be found", because it no longer
measures that.

The live count of affected players is zero today, which is not evidence it was
harmless: David Aitken was exactly this case until his mis-spelled absence rows
were deleted the same morning.

## 2026-09-21 — `bg=ffffff` was always supported; it just couldn't reach the page

Mango's developer, embedding the league on mangosportsco.ca:

> _"Even though bg=ffffff is passed in the query parameters, the embed continues
> to render with the default beige/cream background… Because the iframe is
> cross-origin, we cannot override the internal CSS from our parent page."_

Right about the symptom, wrong about both causes. The parameter exists and
`ffffff` parses fine — `parseHexColor` strips an optional `#` and matches six
hex digits. And the iframe has nothing to do with it; it was ours.

**The bug is one line of CSS semantics.** `globals.css` declares the palette
twice: raw tokens (`--paper: #f1e9d9`) and aliases derived from them
(`--background: var(--paper)`, `--border: var(--rule)`, `--card`,
`--foreground`, plus the legacy `--surface`/`--text` family). Custom properties
substitute **at computed-value time on the element where the declaration
lives** — so every alias was resolved against :root's beige before a descendant
was ever reached. `EmbedTheme` set the raw tokens in a `style` attribute on a
wrapper div, which moved `bg-paper` and nothing else. The wrapper's own
`bg-background` stayed beige, and so did `body`, which carries `bg-background`
from `@layer base` — filling everything the content didn't inside a fixed
700px-tall iframe. That is precisely what he was looking at.

Confirmed against the deployed page rather than reasoned about: the live
wrapper serves `class="bg-background text-foreground p-3"` alongside
`style="--paper:#ffffff;…"`. Both true at once, which is the whole bug.

**The fix declares the same variables on `:root`** (`embedThemeCss`), where the
cascade picks our `--paper` and the aliases then substitute from it. So the
body, the table rules, the cards and every shadcn semantic follow — without the
function enumerating twenty aliases it would drift from. Rendered as the
children of a `<style>` element rather than `dangerouslySetInnerHTML`, which
this codebase has nowhere: every value came through `parseHexColor`, so the text
is `:root{--name:#rrggbb;…}` and contains nothing React would escape. A test
pins that, by stripping the braces and requiring every remaining token to match
`--name:#rrggbb`.

**Also fixed, unreported:** `--border` was aliased the same way, so table rules
stayed beige on a white embed, and `--foreground` only looked right because the
default ink happens to equal the themed ink on white — it would have been
unreadable on a dark background.

**Tests:** 1578 passing across 123 files (3 new); `tsc --noEmit` and eslint
clean. No migration.

## 2026-09-21 — A removed list, so a deletion stops being a disappearance

Earlier today the delete rule was loosened to let organizers remove sign-ups
paid off-platform, and `HANDOFF.md` recorded the cost honestly: a delete left
**no trace at all**. No audit row, no snapshot, and `registration_payments`
cascading off `free_agents` took the fee with the person. The owner's answer,
which is the better one: _"Put these removed players in a removed list and let
org add a note."_

Migration **0127** adds `removed_signups` — the sign-up, the summary of what
they had actually paid, a jsonb snapshot of every payment row as it was, and an
editable note. Applied and verified against production: 15 columns, RLS on, all
four policies, `remove_free_agent()` present, 0 rows.

**Why a new table rather than `restore_points`.** That was the obvious reuse and
it is a trap. `restoreFromPointAction` casts the payload to a `SnapshotPayload`,
resolves teams and rebuilds fixtures; `getRestorePoints` has no scope filter;
and `RestorePointsCard` renders a Restore button on every row it is handed. A
signup snapshot parked there would sit in that card reading "0 fixtures · 0
results" beside a button that runs the schedule path against a payload with no
matches.

**Why an RPC.** The Supabase client issues each statement separately, so doing
this from the action would be an insert and then a delete: either a record of a
removal that did not happen, or — the one nobody would ever notice — a deletion
with no record. `remove_free_agent()` snapshots and deletes in one call.

**What is deliberately NOT in that function.** Any rule about *which* sign-ups
may be deleted. It carries only the admin check, exactly like
`delete_competition`. The card-versus-off-platform rule stays in
`canDeleteSignup`, where it is unit-tested — a second copy in plpgsql would be
free to drift from the first, which is precisely how 0123 dropped three
behaviours.

**Two smaller calls.** The table cascades with the competition, the opposite of
`restore_points`: that exists to outlive a deletion, this is a note in the
organizer's books, and keeping a withdrawn person's name and email after their
league is gone is exposure with no purpose. And it has an UPDATE policy, which
`restore_points` deliberately lacks — the note is written and rewritten, because
the reason someone left usually lands after the removal rather than during it.

The note is added from the Removed list afterwards, not typed at removal time,
so the two-tap "Remove for good?" confirm is unchanged.

**Tests:** 1575 passing across 123 files; `tsc --noEmit` and eslint clean.

**Not verified in situ:** `remove_free_agent()` gates on `is_competition_admin`,
which reads `auth.uid()`, so it cannot be smoke-tested from a script — as the
Postgres role that is null and the function refuses. Its existence and shape are
verified; the first real removal is the first real test.

## 2026-09-21 — Whose money was it? The delete rule now asks

BVL again, and the part Withdraw didn't cover:

> _"I have 3 players to be removed from the free agents AND have their payment
> records removed, as it was a complete withdrawal, not just off a team."_

`canDeleteSignup` refused because a payment was `paid`. Its reason — the delete
would take "the ledger entry, the platform fee owed on it and any refund" — is
sound for a card charge and **empty** for these: every BVL individual payment is
PayPal with `application_fee_cents = $0`, `platform_fee_settled_at` null, and no
Stripe refund object. Nothing is owed to us. What the guard was protecting was
the organizer's own note to themselves, about money they had already refunded
from their own PayPal, where the real record lives.

So the rule now asks whose money it was rather than whether money moved. Card
refuses, always. Off-platform with zero fee and nothing settled is allowed. A
null `method` refuses — provenance unknown, and a wrong guess destroys something
unrecoverable. A non-zero fee or a settled fee refuses whatever the method,
because that row is part of our accounting however the money travelled.

Owner's call, and the reason this is coherent rather than merely convenient:
_"We are not accountable for refunds outside of the platform."_ If we are not
the book of record for that money, we should not hold the organizer's record of
it hostage.

**What I rejected, and why it wasn't free.** The obvious safety net — snapshot
the sign-up before deleting — looked like a cheap reuse of `restore_points`
(text `scope`, jsonb `payload`, nullable `match_id`: no migration). It isn't.
`restoreFromPointAction` casts the payload to `SnapshotPayload`, runs
`resolveTeams`, and rebuilds fixtures; `getRestorePoints` has no scope filter;
and `RestorePointsCard` renders a Restore button on every row it is given. A
signup snapshot would sit there reading "0 fixtures · 0 results" beside a button
that runs the schedule path against a payload with no matches. Recorded in
`HANDOFF.md`: a delete leaves no trace at all, and that was accepted knowingly.

**Tests:** 1575 passing across 123 files; the off-platform branch has its own
cases, including the one BVL row that matters — a double-payer whose two PayPal
charges are both off-platform. `tsc --noEmit` and eslint clean. No migration.

## 2026-09-21 — Individual payments get a panel of their own

The other half of BVL's question. Withdraw fixed the list; this fixes _"I can
only seem to find payment records for team, and not INDY player/registrants."_

**They were never filtered out — they were never represented.**
`getCompetitionLedger` groups charges by `team_id`, and an individual's charge
has none; it hangs off `free_agent_id`. Those rows landed under a `null` key
and were dropped. The only view that ever included an individual was the
offline payments inbox, which filters `status = 'pending'` — a to-do list of
*unconfirmed* payments. Confirm one and it left that list for nowhere.

`lib/payments/individual-ledger.ts` mirrors `competitionLedger` deliberately, so
the two panels read the same way: settled means paid or refunded, outstanding is
measured against the event's individual fee rather than by counting rows, and
someone withdrawn owes nothing while money they already paid still counts as
collected. Ten unit tests, including the real BVL Wednesday shape.

**Three calls worth recording:**

**It is not Stripe-gated, unlike every neighbouring query.** Those open with
`if (!mode.configured) return null`, which is right for card payments and fatal
here: BVL has no connected account at all and collects every dollar through
PayPal. Copying that line would have blanked the panel for precisely the
organizer who asked for it. The `livemode` filter still applies when a key IS
configured, so a test row can never colour a live total. For the same reason the
card renders OUTSIDE the `{ledger && …}` guard on both pages.

**No refund control, by policy.** _"We are not accountable for refunds outside
of the platform."_ These fees are taken off-platform, so a refund happens in the
organizer's own PayPal. A button implying the app can send money back would be a
lie about what it touched. The card says where refunds actually happen instead.

**No tax or platform-fee stat.** Every offline row carries `tax = 0` and
`fee = 0` — we never handled the money, so no fee was taken. Those stats would
read a permanent $0 beside real money, which looks like a bug rather than a
fact. Collected and Outstanding only.

**A stale type corrected on the way past.** `registration_payment_kind` has three
values in `schema.ts` and the database (`team_full`, `player_share`,
`individual`), but `LedgerCharge` and `TeamPaymentRow` both declared only two —
so the cast in `getCompetitionLedger` was quietly untrue about 20 live rows.

**Verified against production, not just the types:** BVL's four leagues run
through the real function give Wednesday $2,040 collected against $340
outstanding, which matches the six confirmed PayPal payments and the one still
pending.

**Tests:** 1569 passing across 123 files (10 new); `tsc --noEmit` and eslint
clean. No migration.

## 2026-09-21 — A Withdraw button, because the refusal pointed nowhere

BVL's organizer, on three women who pulled out of individual registration:

> _"I went to remove them from the available list … but it said I need to remove
> their payment record first. Where can I do this? As currently, I can only seem
> to find payment records for team, and not INDY player/registrants."_

**The refusal was right.** `registration_payments.free_agent_id` cascades, so
deleting a paid sign-up takes the payment row, the ledger entry, the platform
fee owed on it and any refund with it. All three were `paid`, $340 by PayPal.

**The advice was not.** It read "refund it first, or leave them withdrawn", and
for an individual the organizer UI offered neither:

- **No Withdraw control existed at all.** `setStatus` accepted `"withdrawn"` and
  `setFreeAgentStatusAction` took it, but the only button wired to it passed
  `"available"` — **Restore**, which renders only on someone already withdrawn.
  Nothing could put them in that state. The edit dialog is details-only; the
  Players tab merely displays status. That is why zero BVL free agents were
  withdrawn: not a preference, an impossibility.
- **Refunds are team-and-Stripe only.** `RefundDialog` renders only from
  `payment-team-row`, and `getRefundablePayment` returns early without Stripe
  and hands back a `teamId`. These fees are PayPal, confirmed offline, with no
  payment intent to refund against.

**And her literal question has a literal answer.** Individual payments surface
in exactly one screen — the offline payments inbox — which filters
`status = 'pending'`. It is a to-do list of *unconfirmed* payments. She had
already confirmed these three, so they left the list. After confirmation an
individual's payment has no screen anywhere. Teams have a dashboard.

**The fix is one button**, in the slot Restore already occupies. The two are
mutually exclusive, so a narrow position column never grows a fourth control,
and the row is width-identical to the withdrawn case that already rendered
fine. No confirm step: withdrawing is reversible and Restore sits right there —
unlike the X beside it, which deletes for good.

Everything downstream already existed. The action clears `placed_team_id` and
pulls their roster row, withdrawn rows already render greyed with Restore, the
count already shows in the card description, and withdrawn sign-ups already
free their cap spot. The feature was built; only the way in was missing.

Both refusal messages now name Withdraw, with a test pinning that they point at
a control that exists. The old wording is what sent an organizer hunting for a
screen that was never built — refusing is right, misdirecting is not.

**Still missing, and recorded in `HANDOFF.md`:** there is no way to refund an
individual's offline payment. Withdraw unblocks the list; the money side has no
organizer surface at all.

**Tests:** 1559 passing across 122 files (1 new); `tsc --noEmit` and eslint
clean. No migration.

**Correction, same day — the button broke the layout it sits in.** The reasoning
above ("in the slot Restore already occupies, so the row is width-neutral") was
wrong, and wrong in a way worth naming: Restore only ever rendered on
**withdrawn** rows, which are rare and greyed, so its ~85px never competed with
anything. Giving *every* row a text button put ~200px of fixed content —
checkbox, Edit, Withdraw, X and three gaps — into a position column that is
~260px wide at `xl:grid-cols-4`. Every child but the name is `shrink-0`, so the
name, carrying `min-w-0` and `truncate`, was the only thing that could give. It
collapsed to a single character, which is what the organizer saw.

Fixed by letting the controls move rather than the name: `flex-wrap` on the row,
`min-w-[8rem]` on the name so it claims a real width instead of nothing, and the
three buttons grouped in one `ml-auto` wrapper so they wrap to a second line
together and stay right-aligned instead of breaking apart one at a time. At
four-column widths that is now deterministically two lines rather than a lucky
fit.

The label stays a **word**. An icon would have saved the 85px and re-created the
exact problem the button was added to solve — nobody could find this control
when it did not exist, and an unlabelled one is barely better.

A layout claim reasoned about but never looked at is worth no more than a guess;
this one cost a round trip through the organizer.

## 2026-09-19 — The overall ranking existed all along, unshown

> _"Why isnt there an overall ranking in this one?"_

It was a fair question with a surprising answer: **no tournament has ever had
one.** "Overall standings" is a league table — `WeightedStandingsTable`, rendered
on exactly two pages — while the tournament Standings tab renders per-pool
groups and stops there. Nothing was misconfigured on Summer Forever.

The ranking itself was never missing. `crossPoolSeedOrder` ranks every team
across its pools, normalising onto set/point **ratios** so a pool that ran to 15
and one that ran to 25 compare fairly. It ran when the bracket was seeded,
produced the order, and threw it away. Twelve teams were seeded 1–12 and the
only surviving trace was which four got byes.

So this surfaces the same function's output as a table: a **By pool / Overall**
toggle under the division tabs, and `lib/standings/overall.ts` to map groups
through `crossPoolSeedOrder`. No new query and no second data path —
`StandingsRowView extends StandingRow`, so the rows already on the page carry
the ratio and tiebreaker fields the ranking needs.

**The bug worth the test.** `position` is a team's rank *within its pool*, and
the table renders that field for both the rank column and the leader's claret
highlight. Re-ordering the rows without renumbering produced a table reading
1, 1, 2, 2 with two teams styled as the leader. `overallRows` renumbers to
1..N, and a named test pins it, along with one asserting the caller's rows are
never mutated — they belong to the per-pool tables rendering right beside it.

**Offered only where it means something.** An overall ranking interleaves
*parallel pools* that played the same stage. A tiered league's groups are tiers,
where identical maths would rank tier 6's winner alongside tier 1's — confidently
wrong. The gate is `every(g => g.poolId)`: non-null for real pools, null for
league tiers, so leagues never see the toggle.

**A diagnostic note for next time.** The screenshot that prompted this showed
"Helix x Brownie" in the org chip, but the teams in it belonged to SUMMER
FOREVER. The chip is the org *switcher*, not the competition's own org, and it
sent me inspecting the wrong event first. Team names identified the real one.

**Tests:** 1558 passing across 122 files (6 new); `tsc --noEmit` and eslint
clean. No migration, no schema change.

## 2026-09-17 — Standings split by division, opening on your own

> _"Add multi tabs here that shows divisions. So people don't have to scroll.
> Make this easier for teams to just see where they are seeded easily"_

Summer Forever's standings stacked six pool tables — Pool A/B/C Womens, then
Pool A/B/C Mens — so a player on a phone scrolled past three tables that were
not theirs to reach their own. `StandingsGroups` now renders a division strip
above the tables and shows one division at a time.

Three calls worth recording:

**It opens on the viewer's own division.** The public page already passes
`myTeamIds`, so the initial tab is the one holding the viewer's team. The ask
was about finding *where they are seeded*, and the best version of that costs
zero taps. Organizers pass no team ids and land on the first division.

**Tabs only when every group names a division.** Filtering to one tab would
otherwise hide an unnamed group outright — and a team that cannot find itself is
a worse outcome than scrolling. The gate is `showDivision && divisions.length >
1 && groups.every(divisionName)`. The selection also falls back to the first
division rather than holding a stale name if the groups change underneath.

**Leagues are untouched by construction, not by luck.** Every league call site
passes `showDivision={false}`, and league groups carry `divisionName: null` (a
tier's name rides on `poolName`). Both halves of the gate fail, so the league,
team and embed standings render byte-identically. Mango's six tiers still stack
— the same treatment would likely help there, but that is a separate decision
and was not smuggled in here.

The file became a client component. It already imported `PositionPill`, which is
client, and its heavy imports (`MatchFormat`, `StandingsGroup`) are type-only
and erase at compile, so nothing new crosses the boundary; the two public tab
shells that render it were client already. The toggle mirrors the schedule
view's `ToggleButton` rather than exporting it across features — one is private
to `schedule-view.tsx` and copying eight lines beat coupling two features.

Tab labels are the division names verbatim, so they were checked against the
live rows: Summer Forever reads **Mens | Womens**, three pools each.

**Tests:** 1552 passing across 121 files; `tsc --noEmit` and eslint clean. No
migration, no schema change, no data touched.

## 2026-09-17 — A division's own courts beat the saved playoff format

The owner saved the playoff format for Summer Forever and the courts came out
as `[2,4,6,8]` for both divisions. I suggested clearing the field so brackets
would use all eight. He corrected me:

> _"The reason I entered courts for playoffs is because mens and women play on
> different height nets and it shouldn't make sense to put that field blank."_

He is right, and it exposes a flaw in what I shipped in 0125. `playoff_courts`
is stored **per competition** — deliberate, so both divisions get the same
bracket shape — but courts are the one part that must NOT be shared when the
nets differ. Whichever panel saved last set the courts for both, so one
division's bracket would have been scheduled onto the other's nets. Blanking it
would have done the same thing, just less visibly.

**No migration: the app already knew.** `divisions.courts` holds Mens
`[1,3,5,7]` and Womens `[2,4,6,8]` — that IS the net-height split, recorded when
the pools were arranged. Each division's Generate panel now defaults to its own
courts, ahead of the saved format.

Precedence is **division courts → saved format → every court**, and the ordering
is the point: a division's courts are a fact about the venue, while the saved
format is a preference stored once for the whole competition. A physical
constraint should not lose to a shared default.

Worth noting what this is not: the saved format still governs who advances, how
many, and the 3rd-place game, and it still applies to both divisions — which is
what keeps the two brackets the same shape. Only the courts are read per
division.

## 2026-09-17 — Regenerating threw away the no-referee layout

Byron, two days before Summer Forever: _"Its also only using 6 nets again 😭"_.
He had regenerated his pools, and the regenerate rebuilt the schedule **with
referees, one pool per court** — 6 nets instead of 8, six waves instead of five,
finishing 13:30 instead of 12:45. Tuesday's re-time was gone.

**The cause was a path I only half-wired.** When I shipped `teams_referee`
(0124) I passed it into `layoutPoolSchedule` on the single-day path and left
`layoutMultiDaySchedule` alone. Giving each division its own courts is precisely
what routes a competition through that second function — and following my own
advice about splitting Mens onto 1/3/5/7 and Womens onto 2/4/6/8 is what put him
there. So the better his setup got, the more certainly a regenerate reverted it.

**Passing the flag through was not enough.** That function re-slots each court's
games to 0, 1, 2… by position, which is right when a pool OWNS a court — the
gaps are wasted time. Under wave packing the gaps are load-bearing: a court is
idle in a wave *because* those teams are playing elsewhere in it. Compressing
them slides a team's games on top of each other. A naive pass-through would have
produced a schedule that looked fixed and double-booked people, two days before
the event.

So the wave is preserved when refs are off, and compressed when they are on. The
reffed path is byte-for-byte unchanged, and there is a test asserting exactly
that so the claim isn't just mine.

**The test that matters** is the one that would have caught this: with refs off,
no team may appear twice in the same (day, slot). Six new cases in all, covering
no referees, court disjointness, divisions sharing courts still being blocked
rather than interleaved, and a pool genuinely spreading across two courts.

**His schedule was restored before any of this** — re-timed back to 5 waves, 8
courts, 0 refs, Mens on 1/3/5/7 and Womens on 2/4/6/8, ending 12:45. Verified
against the live data.

**The other half of his message resolved itself.** "It keeps giving me 4 pools of
3" was the stale `target_games_per_team = 2` flagged days earlier: a target of 2
sizes pools at 3. With it corrected to 3 the draw is 3 pools of 4, and each
pairing playing 2 sets at best-of-2 is exactly the 36 matches he wanted.

## 2026-09-17 — A ladder table where the LOWEST score wins (migration 0126)

Mango's organizer: _"The league doesn't look like it has overall standing with
the weights we talked about."_ Two faults behind that, one mine and one deeper.

**Mine first.** The weighted table already existed and was already on both the
organizer and public league pages — I had told him nothing computed it, which
was simply wrong. It rendered nothing because of how I filled it in: I set each
tier's `weight_base` (1, 4, 7, 10, 13, 16) and left `weight_per_set_win` null,
and `getWeightedStandings` skips any tier where either is null. Six unpriced
tiers meant `tiers.length === 0` and an empty table.

**The deeper fault is that the numbers could never have worked.** His rule is
"top team gets 1, 18th gets 18, the more points the lower they end up". The
existing table scores `base + setsWon × perSetWin` and sorts highest-first — so
winning sets RAISES a total that his scheme needs to fall. No choice of weights
reconciles that; the direction is opposite. I should have caught it when he gave
me the rule instead of storing a half-filled config and moving on.

**So a league now says which way it scores.** `league_settings.ladder_scoring`
is `points` (the default — every existing league, unchanged) or `placement`. In
placement mode a team scores its tier's number plus where it finished that
night, and the lowest season total wins. Sets score nothing, which makes
`weight_per_set_win` being null correct rather than a gap.

**`lib/stats/placement-standings.ts`** is the pure scorer, mirroring rather than
extending `weighted-standings.ts` — merging them would mean a sort direction
flag threaded through scoring that means opposite things. Nine tests, including
the one that matters: six tiers of three produce exactly 1 through 18, no gaps,
no collisions.

**Finishing order has two sources.** `result_rank` where an organizer typed it
(0117, built for Scarborough, who won't enter forty scores a night), otherwise
derived from that night's results with `rankLadderNight` and the league's own
tiebreaker. A night with no results is skipped, never scored — zero would beat
winning Tier 1.

**Rendered as a separate table, deliberately.** Same card, different columns:
Score not Points, nights not sets, and a heading that says lowest wins. A table
that looks identical but ranks the other way round is how a captain reads
themselves as top when they are bottom.

**Two limits worth stating.** Missing a night lowers a total, which under "low
is good" flatters it — inherent to summing, and it doesn't bite Mango because
all 18 teams play weekly; a team matching a total over MORE nights is ranked
ahead, which is the only defence here. And nothing shows until nights are
actually scored: Mango has week-1 placements for all 18 teams but zero completed
matches.

## 2026-09-17 — Turning the waiver on made two teams lose their names

Mango's organizer: _"What is this TBD in schedule? All teams have names now."_

He was right, and "TBD" was not a team. It is the fallback the schedule prints
when it cannot resolve a team's NAME. The match was intact the whole time —
stored as Toronto Panthers v Kavi, with both team ids set and nothing null.

**Attaching the waiver caused it.** `sync_team_entry_status` moved the only two
teams with rostered players to `pending_waiver`, and `loadSchedule` built its
name map from a team list filtered to `status = 'active'`. So a held team fell
out of the lookup and its fixtures rendered as "… v TBD". The better the gate
worked, the more teams lost their names — exactly backwards.

**The filter was written for a different problem.** Its comment says "Unpaid
teams are not entrants yet (migration 0066)", and that rule is about who
reaches a pool, a schedule or the standings. `pending_waiver` arrived later with
0101 and was swept into the same `status = 'active'` test by accident. Hiding
what a team is CALLED never enforced 0066 anyway; teams are kept out of
schedules upstream, where it belongs.

**Two queries fixed** — `loadSchedule` (leagues) and `getPoolsView`
(tournaments). Both now load every team regardless of status, because a name is
not a privilege. The genuine entrant filters are untouched: standings,
registration and who gets scheduled all still say `active` only.

**It was hiding a second fault.** That same list decides which TIER a game
belongs to, so a held team's games were also falling back to the opponent's tier
— or into no tier at all when both sides were held. One filter, two symptoms.

**Checked before changing anything:** the printed gym sheet and a player's own
match list look teams up by id with no status filter, so neither was affected —
a paper sheet reading "TBD" on the night would have been the worse failure. Only
two functions call `loadSchedule`, both wanting names, so nothing downstream
treated that list as "entrants".

No new test: the change removes a filter from a Supabase query, with no pure
logic to cover.

## 2026-09-17 — Move a league team between tiers

Mango's organizer mis-assigned teams to tiers before week 1 and had no way to
correct it. A league team's `division_id` is written by `addTeamAction` when the
team is created and **never updated again** — none of the nine league actions
touched it. The only remedy was to delete the team and add it back, which throws
away its captain invite too.

Worse, the Teams card already told him he could: _"Pick which tier each team
plays in."_ `ManageTiersDialog` manages the tiers themselves, and `AddTeamForm`
sets a tier only at creation, so the copy promised something the page could not
do once a team existed.

**Pre-season only, and that's a real rule rather than a shortcut.** Tier
membership changes hands at week 1: with no placements, `drawLadderWeekAction`
reads `teams.division_id` and writes week 1's `ladder_placements` FROM it; from
then on the draw reads the placements and ignores the column. So a hand-move
after the season starts would look like it worked and move nobody. It refuses
with a message pointing at promotion/relegation instead.

The rule lives in `lib/ladder/tier-move.ts` as a pure function with its own
tests, because "before the season only" is the kind of constraint that rots when
it's buried in an action. It also covers the cases the dropdown actually
produces: re-picking the current tier is a **no-op, not an error** (a select
fires on every change), a withdrawn team is refused, and a tier belonging to
another competition is refused — that last one would take the team out of this
league without removing it.

`TeamManagementList` gains an optional `tiers` prop, defaulted, so the
tournament page and the KotC pair list are untouched; the dropdown only appears
where there's more than one tier to move between.

## 2026-09-16 — A team with no captain invite was a dead end

Setting up Mango Sports' new ladder surfaced this: **a team with no pending
captain invite had no way to get one.** The management list rendered "No captain
added yet." as plain text with no control beside it, and the captain slot fell
through to `null` whenever there was neither a captain nor an invite.

`editTeamInviteAction` could always have done the job — it inserts an invite
where none exists and reuses one where it does — but **nothing in the UI ever
called it**. Every other control (`editInviteEmailAction`, `removeInviteAction`)
works on an invite by id, so the first one had to come from somewhere else:
the registration form, which creates the team *with* a captain email.

That makes it a real bug, not just a consequence of creating teams by script.
`removeInviteAction` exists, so any organizer who removes a captain invite lands
in the same dead end and cannot undo it.

**Added an "Add captain" dialog** wherever a team is unclaimed with no captain
and no captain invite — including the case where a team has partners but no
captain, which hit the same `null` branch. It shows the **claim link on
success**, because the invite email is best-effort: when `emailSent` is false
the organizer needs something to paste, and finding that out across eighteen
teams is a bad moment to discover there's nothing to copy.

No new test — a dialog wired to an existing, already-guarded action, with no
pure logic of its own.

## 2026-09-16 — Ask individuals to sign in BEFORE the form, not after

**Reported on BVL:** new users choosing to sign up on their own "doesn't look
like the redirection works".

**It wasn't a broken redirect — there was no redirect to break.**
`IndividualSignupForm` took an `isAuthed` prop and never branched on it.
`SignInOrCreate` was imported at the top of that file and never rendered. So a
signed-out player got the entire form, filled in name, email, phone, positions,
level and notes, pressed **Sign me up**, and only then met `register_individual`
raising _"You need to be signed in to sign up."_ (0105, line 78 — the action
even whitelists that message to pass it through). Nothing had attached a `next`
anywhere along the way, so there was no route back either.

The team path has had this gate the whole time
(`stepped-registration.tsx:159`), which is why it only showed up for
individuals. Added the matching early return — placed after the hooks, since an
early return above `useForm` would break the rules of hooks.

**Second bug, which the fix would otherwise have exposed.** `EntryChoice` keeps
the team/individual choice in `useState` with nothing in the URL, and the page
passed a bare `/register/[slug]` as `returnTo`. So even a perfect auth round
trip returned people to the two-door chooser with neither door open — they'd
have to work out that they must pick "sign up on my own" again. The individual
form now returns to `/register/[slug]?as=individual`, and the chooser takes an
`initialChoice` to reopen that door. `safeNext` and `isRegistrationPath` both
accept the query string, so the cookie fallback still works.

**Checked rather than assumed:** the closed-registration branch renders the same
`individualForm` variable, so both doors were fixed by one change; and the
fourth `returnTo` on that page is the waitlist form, which is a separate path
and was left alone.

**No new test.** It's an early return plus reading one search param — no pure
logic to cover, and UI tests here are reserved for critical flows.

## 2026-09-16 — Save the playoff format, and hold Generate until pool play is done (migration 0125)

**Two asks from the same screenshot.** Beach Barbiez: _"let the organizer set
the playoff format and save it"_, and _"have the generate playoff enabled only
when all round robin games are completed"_.

**Nothing about the format was saved.** Who advances, how many, the 3rd-place
game and the courts were all component state, chosen in the moment somebody
clicked Generate. For a competition with two divisions that is a real hazard:
the panel defaults to top-2-per-pool, so Summer Forever's 12-team divisions
would have produced **6-team brackets**, and two panels set differently would
have produced two brackets that don't even match each other — the opposite of
the organizer's "both must be the same structure".

**So it is stored per competition, not per division** —
`playoff_advance_mode`, `playoff_third_place`, `playoff_courts`, alongside the
existing `playoff_teams`. One saved format, every division, consistent by
construction rather than by care. The mode is what gives `playoff_teams` its
meaning (that many per pool vs that many overall), which is why it has to be
stored beside it rather than inferred. Saving deliberately generates nothing,
so it is safe weeks ahead and safe to redo.

**Generate now waits for the last result.** Seeds come from the standings, so a
bracket drawn mid-pool is drawn from a table that is still moving — and the only
fix afterwards is regenerating, which discards every playoff match including any
already scored. `poolPlayComplete` already existed and already meant exactly
"every pool match is `completed`"; it just drove a warning rather than the button.

**Gated behind a `requireComplete` prop rather than applied everywhere.** The
panel is shared with `LeaguePlayoffPanel`, and a league with one abandoned game
that never gets a score would have been locked out of its own playoffs for good.
Tournaments pass it; leagues keep the warning.

**Scope kept honest:** Save is offered on the single-bracket path only. The dual
Championship/Consolation mode carries its own split sizes, which 0125 has no
columns for, and half-saving a format that can't be fully restored is worse than
not offering it.

**One thing the typecheck caught.** I added the three fields to `PublicTournament`
instead of `TournamentDetail` — the anchor comment I matched on appears in both
interfaces. Eight errors, named precisely, fixed by moving them. The public
bracket preview needs only `playoffTeams` and was deliberately left alone.

## 2026-09-16 — Nobody has to referee, and the round robin got 45 minutes shorter (migration 0124)

**Two questions from Beach Barbiez that turned out to be one.** "Is there no
option to not have teams ref?" — there wasn't; reffing was unconditional, with
no setting, no UI, and every competition in the database at 100% ref coverage.
And "the system is only using 6 of our 8 courts" — because a pool is an
indivisible block on one court, and they have exactly 6 pools.

**Those are the same fact.** Reffing is the *only* reason a pool's games must
share a court and run back to back: the idle teams have to be standing there.
Remove it and the constraint goes too.

**`competitions.teams_referee`, default true**, so nothing changed for the other
34 competitions. When false, `layoutPoolSchedule` routes to a new pure
wave-packer: up to one game per court per wave, team-disjoint, preferring
whoever has waited longest.

**The prize is arithmetic, not cleverness** — 36 games on 8 courts is
ceil(36/8) = 5 waves however you arrange them, against 6 today. Exactly one
wave: 45 minutes, 13:30 → 12:45. The tests assert it reaches that floor. I
first framed 45 minutes as small; the owner pushed back, and he was right —
it's a beach event, and finishing earlier is the point.

**Two fairness properties are locked because the obvious greedy gets them
wrong.** Ranking purely by rest marches one pool through waves 0, 1 and 2 —
three games on the trot, *worse* than what it replaces — so ties break toward
whoever has played least, which rotates the pools. And "a wave off between every
game" is impossible here rather than merely unmet: 3 games with a gap of 2
everywhere forces all 12 teams into wave 0 on 4 courts. The guarantees are that
nobody plays three in a row and everybody gets a real break. I wrote the
impossible assertion first and the test caught it.

**Applied to Summer Forever through the re-optimize planner, not
regeneration** — court, time and ref only, so the draw, the matchups and
games-per-team are untouched. Verified live: Mens on Courts 1, 3, 5, 7, Womens
on 2, 4, 6, 8, no shared court, 5 waves each, 0 refs, ends 12:45.

**Regeneration honours the flag but does not split courts by division** — a
redraw spreads both over all 8 courts. Same finish time; Re-optimize restores
the split. Recorded rather than half-built.

## 2026-09-16 — A bracket per division (migration 0123)

**Shipped for a real event three days out.** Beach Barbiez run Summer Forever
(Sat Sep 19, Mooney's Bay, 6 courts) with **Mens 12 and Womens 12 in one
competition**, and sent through a printed 12-team chart: seeds 1–4 on byes,
everybody in. Byron: _"This is basically what we want i think. Minus the double
elim title"_ — confirmed as **single elimination**, so it is the chart's top
bracket, twice.

**The generator already drew that chart exactly.** Verified against the real
thing before writing any code: byes to seeds 1–4, round 1 of 8v9 / 5v12 / 7v10 /
6v11, the same four quarter-finals and the same semi-final pairings, 11 matches.
No scheduler change was needed. `tests/scheduler/bracket-12-team.test.ts` now
locks that shape — the file covered 8, 5, 2, 13, 6 and 16 teams, never 12.

**What actually blocked it was that brackets were division-blind.**
`generateBracketAction` deleted EVERY bracket match in the competition before
inserting, and a slot was identified by `(bracket_track, round,
bracket_position)` — competition-scoped. Generating the Womens bracket would
have wiped the Mens one, finished scores and all. There was also no sequence of
clicks that could produce two brackets: the panel's dual mode splits by **global
rank** (top 12 vs bottom 12 of the whole field, a Mens/Womens mix), and
`SeedList` only swaps adjacent entries within one list, so teams cannot be moved
across tracks.

**`matches.division_id`, nullable and deliberately not backfilled.** Only bracket
rows set it; a pool match's division is already reachable through `pool_id`, so
all 36 existing matches were untouched (verified: 0 rows changed). Generation
scopes its delete and stamps the column; `getBrackets` groups by division and
labels from the division name, so the headings read "Mens" and "Womens"; the
tournament page renders one panel per division, each fed only its own pools —
which is what makes `crossPoolSeedOrder` rank 12 teams and seed 1–12. Re-seeding
is deliberately not offered per division: the seed order is stored per
competition, so two divisions would overwrite each other.

**A regression caught before it mattered, and worth the warning.** 0123 rewrote
`place_bracket_winner` from the **0013** text — but four migrations had grown it
since (0026 track scoping, 0094 the 3rd-place game, 0099 placement routing). The
first version silently dropped the placement early-return, first-round losers
dropping into the placement round, and the bronze game. It was applied to prod in
that state. Restored, re-applied, and `apply-0123.ts` now asserts each carried
behaviour **by name** rather than just the new one — a rewrite that loses one of
these is invisible until an organizer enters a score on the day. `final_round` is
scoped by division too: it reads `max(round)` from the data, and without that
predicate it measures the sibling division's tree.

**Also fixed, and no longer theoretical:** the missing `bracket_track` predicate
recorded yesterday. POUNDTOWN — the same organizer's last event — has
championship R2P1 and consolation R2P1 sitting side by side, and escaped only
because that bracket was generated and never advanced.

**Two things left undone, on purpose.** `tournament_settings.playoff_teams` is
still `8` for Summer Forever and should be `12` ("everyone makes playoffs") — the
write was refused as a shared-resource change and is the owner's to make. And
`getBracketPreview` is still competition-wide, so between now and generation it
projects a Mens/Womens-mixed bracket to players via `getMyPlayoffProjections`; it
stops the moment the bracket exists.

## 2026-09-16 — Undo a payment confirmed by mistake (migration 0122)

**Shipped, and the live mistake is already fixed.** Brampton's organizer: "I
accidentally approved SERVES YOU RIGHT as PAID, but they have not. How can I
revert this? Should I click remove? Or would that fuck things up further?"

**It would.** `removeTeamAction` DELETES the team, its payment rows cascade
away with it, and where a schedule exists it deletes every match and pool in
the league so the field can be redrawn. It only refuses once a match has been
played.

**Nothing could undo a confirmation.** `dismissOfflinePaymentAction` refuses a
paid row on purpose, and the refund path needs a Stripe charge that a PayPal or
e-transfer payment has never had — and a refund is the wrong record anyway: it
says money went back, when none ever arrived.

**`unconfirm_offline_payment` is the exact reverse of confirming**: back to
`pending`, `paid_at` and `confirmed_by` cleared, the reason kept where the
confirmation note lived, and the team or free agent re-gated only if that
confirmation was what let them through. It refuses a card charge, a payment
whose platform fee has been settled (undoing would un-bill it), and one with a
refund recorded. A second call returns false rather than erroring.

**One deliberate limitation, written into the migration:** a team the organizer
admitted unpaid on purpose also sits at `active`, and this cannot tell the two
apart, so it re-gates them and the organizer clicks "Admit anyway" again.
Re-admitting is one click; a team silently counted as paid is a hole in the
books.

**The amounts are left alone.** Confirming overwrote the quote with what the
organizer said arrived, and the original is not recoverable; re-confirming with
the right figure restates it.

**Undo sits on the charge in the payments dashboard**, for offline charges
only, and asks once ("Not paid after all?"). The ledger charge now carries its
`method`, which it didn't before — without it the screen cannot tell a card
charge from a PayPal one.

**Serves You Right, fixed in production:** the $2,040 row is back to `pending`
with the note "Confirmed in error - payment had not arrived", back in the
PayPal inbox to confirm properly when they do pay. The team's own status was
untouched — it sits at `pending_waiver`, so the wrong confirmation had never
admitted them.

---

## 2026-09-16 — Removing a sign-up deletes it

**Shipped.** Brampton's organizer, on a cancelled test registration: "she still
shows up as a 'greyed out' free agent. I'd prefer they were removed completely
if their registration was cancelled." Removing only withdrew them — the row
stayed in the pool, greyed, with a Restore button, in the one list an organizer
reads every week.

**Remove now deletes the sign-up.** Two taps rather than a dialog, because the
pool is a list people scroll on a phone: the ✕ becomes "Remove for good?" and
the second tap does it. A roster row goes with it, exactly as withdrawing did,
so nobody deleted is left on a team sheet.

**Refused once money has moved.** `registration_payments.free_agent_id`
CASCADES, so deleting a paid sign-up would take the ledger entry, the platform
fee owed on it and any refund with it. `canDeleteSignup` allows a delete while
every payment is `pending` or `cancelled` — a request nobody paid only ever
existed to be chased — and refuses on `paid` or `refunded` with a sentence
naming which. Withdrawing and Restore stay for exactly that case.

**No migration:** `free_agents_admin_delete` already allowed an organizer to
delete a sign-up. Nothing had ever called it.

**Roslyn Ng removed** — the test entry that prompted this. Her only payment was
the $340 PayPal request that migration 0119 cancelled, so nothing was owed or
received; the row and that cancelled request are gone, her user account is
untouched, and there are now zero withdrawn sign-ups platform-wide.

**Tests:** 6 removal-rule tests; 1503 passing overall, typecheck, lint and
build clean.

---

## 2026-09-15 — Individual registrants in the Players tab, and editable

**Shipped.** BVL's organizer asked where individual registrants were — they
weren't in the Players tab, and there was no way to correct their details. Both
true. The Players tab listed only people ON a team, and nothing anywhere could
change an individual sign-up's name, email, phone, positions, level or notes
after they submitted it.

**The Players tab now lists the pool too**, after the teams: every sign-up that
isn't withdrawn, marked "Individual — not on a team yet", or "Individual ·
unpaid" while their fee is outstanding. In BVL that is 12 people — four each in
Non-Spiking Tuesday, Spiking Thursday and Women's Wednesday.

**One edit dialog, two sections, each shown only where it applies.** *Sign-up
details* for anyone who signed up as an individual; *League questions* for
anyone with an account. Every BVL individual has an account, so both. A drafted
player with no account (Big Shoots) now gets an edit button for their details
instead of the old "from the draft" dead end.

**The dialog loads the name AS SIGNED UP**, not the row's resolved league
name. For a drafted player with an account those can differ, and seeding from
the league name would have rewritten their sign-up's spelling on save.

**The Free agents card gets the same edit button** for sign-up details, because
the pool is where an organizer is placing people and a spelling fix shouldn't
mean leaving it. League answers stay in the Players tab, which loads the
questions.

**`updateFreeAgentDetailsAction` edits details only.** Status and placement stay
with the draft board and Remove/Restore, which carry the rules for moving
people between teams. Positions are checked against the sport exactly as
sign-up checks them. No migration: `free_agents_admin_write` already let an
organizer update a sign-up — nothing had ever asked.

**Found on the way: individuals are never asked the league's questions.** The
sign-up form collects only its own fields, so all 12 BVL individuals have zero
registration answers — no Gender, no address — and never count in Roster mix.
The organizer chose to fill those in from the Players tab rather than prompt
the players or change the sign-up form.

**Verified:** as BVL's organizer in a rolled-back transaction an update to a
sign-up is allowed, and a plain rostered player's is blocked; the live row was
untouched. 1497 tests, typecheck, lint and build clean.

---

## 2026-09-15 — Big Shoots' draft found cleared, and restored

**Data fix, no code change.** The organizer reported that the draft in Liam's
league was empty: all 27 players showed as `available`, and Team 1–4 had no
one on them.

**What did it, established from the database rather than guessed:**
- `free_agents` has **no trigger that updates `updated_at`**. The draft board's
  "Clear all teams" (`clearDraftAction`) and "Save draft" tidy-up (players not on
  the board go back to the pool) both set `status = 'available'` and
  `placed_team_id = null` **without** touching `updated_at`. The setup script,
  `place_free_agents` and removing a player all set it.
- The last `updated_at` on those rows (00:16 Eastern) is the setup script
  *placing* the 24, which its dry run confirms it does.
- The players were still placed at about 00:46 Eastern: the public player list,
  which only includes a drafted player while they are on a team, returned six
  names per team.
- Liam's `team_members` row on Team 1 survived, which fits a board clear, since
  clearing does not remove memberships.
- Nothing shipped that session writes placements. Those changes only read them.

So an organizer on that league cleared the board, or saved it empty, some time
after 00:46. The app keeps no record of who or when; only the Supabase API logs
would show it.

**Restored in one transaction** from the Test Org draft, which is the same
saved draft. Only `status` and `placed_team_id` changed, name for name and team
for team, and the whole restore was set to abort unless exactly 24 players
matched. The full setup script was not rerun, because it also resets league
settings the organizer may have changed since. Result: six per team, three
available, 24 names on the public page.

---

## 2026-09-15 — Who has played with whom

**Shipped.** The organizer asked where the "players playing with others" matrix
was. It wasn't anywhere. `getPartnerships` had been written to count shared
nights per pair, and nothing imported it. The only "Who has played with whom"
grid on screen was the Reverse Pairs one, which tracks pairs of pairs in a
different format.

**Two places, the organizer's choice:**
- **Stats tab (organizer):** a player × player grid in the same colours as the
  Reverse Pairs grid. Red means never together, green means two or more
  nights, and a plain 1 is the draft working. Rows are numbered, because a
  24-wide grid of names cannot be read, and every cell names both players on
  hover.
- **Under the draft board:** "Never played together". For each player in the
  pool it lists who they haven't shared a team with, which is what matters
  while dealing out new teams. Players who haven't played yet are named once at
  the bottom instead of on every line, where "never played with" them would be
  true of everyone and tell the organizer nothing.

**"Played with" means the same team on the same night**, from saved lineups.
Subs count, and three games together on a Friday count once.

**The unused query was wrong, and would have been wrong on screen.** It took a
game's night from its UTC date. Big Shoots' 8:15 PM round is already past
midnight UTC: 100 of its 198 games land on the wrong date, so every Friday
splits in two. On Test Org's real lineups the UTC version reports **60 repeated
pairings where there are none**. The replacement, `getPartnerGrid`, uses the
competition's timezone through `nightOf`, the same as the attendance stats.

**A drafted player with an account is matched by account.** `FreeAgent` had no
`userId`, so the draft pool would have matched Liam, who is linked to his
account in his own league, by name, and reported that he had never played with
anyone. `userId` is now on the type and its query.

**Checked on Test Org's real rows** (one saved night: four teams of six): 24
players, 276 pairs, exactly 216 never together, every player with 5 teammates,
no repeats. The draft pool has 27 players, and the three still available (Adam
Garbe, Grant Davis, Sean Gade) are shown as not yet played. 12 grid tests.

---

## 2026-09-15 — A team panel shows the current session, not the season

**Fixed, same day.** The public team panel had just started listing players,
and in Big Shoots that exposed a lie. "Team 1" is a slot, not a group of
people: its six players stay together for one three-week session and are then
re-drafted. The panel put today's six names above all 99 of Team 1's games
through May, which reads as those six playing together all season.

**The schedule itself was right, and stays.** Four team slots really do play
every Friday. The other fix, generating one session at a time and regenerating
after each re-draft, was checked and rejected: `generateLeagueScheduleAction`
deletes every match in the league, recorded scores and lineups included, so
each regeneration would have erased every previous session.

**The organizer's choice: current session only.** In a league with
`session_nights`, the panel shows the current block's nights and nothing else
("Session 1 of 11 · Sep 18 – Oct 2 — 9 games · 6 players"), with the list
titled "This session's players". Past and future sessions are not browsable
from it. Leagues without sessions keep the full season, and the Schedule tab
is unchanged: it already opens on the next night, and it names no players.

**"Current" reuses `defaultScheduleDay`** instead of restating it: the session
holding the next unfinished night, today included, or the last night once the
season is over. The team panel and the Schedule tab therefore cannot disagree
about which week "now" is. Between a playoff and the next session's first
night, the next session is current, because the re-drafted teams are the ones
about to play. Sessions are counted over played nights (`splitSessions`), the
same rule `playoffNightsFor` uses, so a session's last night is always its
playoff night and a holiday gap cannot shift either.

**The roster is still each player's current placement**, the only roster the
app stores. After a re-draft it becomes the new session's players with no
further change needed.

**Checked on Liam's league for today (15 Sep):** Session 1 of 11 (Sep 18,
Sep 25, Oct 2). Team 1 shows 9 games instead of 99. Session 5 spans the
holidays (Dec 11, Dec 18, Jan 8). The last session runs Apr 30 – May 14.
11 session tests pass.

---

## 2026-09-15 — Team panels list their players

**Shipped.** On the public league page, tapping a team showed its games and
nothing about who is on it. The panel now lists the players, and its heading
gives the count ("Team 1 — 0 games · 6 players").

**Names come from `competition_player_names`, not `team_members` + `users`.**
That function returns names and nothing else, and it restates the
competition's visibility rule itself, so it is safe for a signed-out visitor.
It also covers all three ways onto a team: claimed accounts, unclaimed invites
and, since migration 0120, drafted players. A drafted league like Big Shoots
has almost no `team_members` rows, so reading that table would have shown empty
teams.

**Confirmed players first, then invites**, alphabetical within each. An unclaimed
invite is drawn with a dashed outline and "Invited — hasn't joined yet" on
hover, because a maybe is not a confirmed player.

**Shared component, opt-in.** `TeamGames` is also used by the public tournament
page, which doesn't pass `players` and so is unchanged. On the league page an
empty team shows "Nobody on this team yet." rather than no list at all.

**Checked against Liam's league:** four teams with six names each, exactly the
saved draft, and no team empty. Typecheck, lint, build and 1474 tests pass.

---

## 2026-09-15 — Days played, nights missed, playoff game wins (migration 0121)

**Shipped.** Big Shoots asked for two player stats: total playoff wins, and
total days played, "to check how many times the organizer had to find subs for
this player". The app could answer neither. Nothing said which nights were
playoffs, and a saved lineup only ever recorded who PLAYED, so nobody absent
was written down anywhere.

**Three columns on the stats table**, each shown only where some row has a
value:
- **Days**: distinct nights on court, for any team, rostered or subbing.
- **Missed**: nights on a team's roster without playing any of its games. A
  player who arrived late and played two of three is not counted, because
  nobody was sent for.
- **PO W**: games won on playoff nights, counting only games they were on court
  for. A game is two sets, so a 1–1 is a tie, not a win.

**Playoff nights: every Nth played night** (`league_settings.session_nights`,
3 for Big Shoots and null everywhere else). It counts nights the league
actually plays, so a blacked-out Christmas yields no night and cannot shift the
sessions. It is null by default because a default of 3 would hand BVL a
"playoff" every third week.

**Absences are their own table, `match_absences`.** Adding an 'absent' role to
`match_appearances` would have been one column, but every reader of that table
treats a row as a player on court, so absent players would be credited with
sets across stats, partnerships and the lineup screen. The new table has the
same per-match grain and is written by the same `writeLineup`. The roster is the
union the lineup screen shows (team members plus drafted free agents); reading
`team_members` alone would record nobody missing in a drafted league. **An empty
lineup records no absences**, because "not recorded yet" is not "everyone
stayed home". Absence writes are best-effort, so a failure logs rather than
telling the organizer their already-saved lineup was lost.

**Missed is organizer-only**, unlike appearances. Who played is the scoresheet;
who did not turn up is between a player and their organizer. RLS lets
competition admins and whoever can enter scores read it (the second group is
needed so a DELETE can reach old rows). The public stats page never requests it,
so its column is hidden, not shown as a misleading row of zeros.

**Players with attendance now appear before scores are in.** Previously a row
needed a scored set. Attendance is recorded the night it happens, so hiding it
until someone enters results hid the number the organizer is chasing.

**A trap found and fixed on the way: the Edit settings form capped round robins
at 1× or 2×.** Big Shoots is saved at 33, one per night, because the generator
reads that count and ignores the end date. That league's settings could not be
saved, and choosing 2× to get past the error would have silently shrunk the
season to three weeks. The edit schema now allows 1–60, and the dialog offers
the league's current value as an option. The create wizard keeps its 1×/2×
choice. "Nights per session" is a field in the same dialog.

**Verified, not assumed:**
- 17 pure attendance tests and 5 validation tests; 1474 tests pass overall;
  typecheck, lint and build clean.
- Migration applied and checked object by object: column, range check, table,
  indexes, RLS, four policies.
- RLS in rolled-back transactions: the organizer can insert, read and delete;
  an unrelated signed-in user reads 0 and cannot insert; a signed-out visitor
  reads 0.
- On Test Org Big Shoots' real rows, a lineup saved without Jamie Orth writes
  exactly one absence per match for him alone (so his draft-list name matches
  his lineup name), giving Missed 1. Counted in venue time, all 72 recorded
  appearances fall on one night (9 Sep), so every player there shows Days 1.

**Known drift, not fixed here:** `match_appearances` (migration 0089) is not
mirrored in `lib/db/schema.ts`. The new `matchAbsences` table is.

---

## 2026-09-15 — Big Shoots runs until May, in three-week sessions

**Corrected.** The first setup gave Big Shoots three weeks. The season actually
runs to May: the same drafted players play three Fridays together (two regular
nights, then a playoff) and are then re-drafted. Still no schedule.

**The generator never reads `end_date`.** It lays rounds onto weekly slots from
the start date until it runs out of rounds, so the three-week season came from
`rounds_per_team = 2`, not from the date. Moving the end date alone would have
changed nothing. With four teams and three rounds a night, each Friday is exactly
one complete round robin, so the season length is set as **33 nights**.

**The calendar, decided by the organizer:**
- Dec 25 and Jan 1 are both Fridays and are **blacked out**. The generator
  *moves* a blacked-out night to the next Friday instead of dropping it, so
  every later session shifts two weeks. Good Friday is played.
- End on a **full session**. The 35 Fridays to the end of May make 11 whole
  sessions (33 nights) plus 2 spare, so the season ends with the playoff on
  **Fri 14 May 2027** and 21/28 May stay empty.

**Playoff format, first version:** play everybody, and the team with the most
wins that night takes the session. Level on wins goes to the team that scored
more points that night. That night's fixtures are the same full round robin as
any other Friday, and standings already show won/lost/tied per night, so no new
mechanism is needed for this first format. Not built: a playoff-night label, a
session-winner list, or standings scoped to one session. Season-long Team 1–4
standings add up results across re-drafts and mean little.

**Verified before writing, then after.** The real `generateRoundRobin` was run
in memory with these exact settings (no DB) and produced 198 games, 99 rounds and
33 nights on precisely the planned Fridays, every night a full round robin
(6 games, every pair once, 3 each), session 5 jumping Dec 18 → Jan 8. The saved
league then reads end 2027-05-14, 33 nights, both blackouts, zero matches, and
the draft still 24 placed / 3 available.

---

## 2026-09-15 — Big Shoots moves into its organizer's own org

**Set up, not yet scheduled.** Liam Johnson created **Big Shoots Men's
Volleyball** as his own organization. His league had been running inside Test
Org, so it is recreated there by `lib/db/setup-big-shoots.ts`: the Holody Centre
venue, the league, its settings, four teams and all 27 sign-ups with the draft
as saved. The Test Org copy is untouched and stays a sandbox, still holding its
practice schedule, one score and 72 lineup rows.

**Copied from the live source rows, not retyped.** The script reads the Test
Org league at run time, so matching "the same features" is a copy and not a
transcription that could drift. Only what the organizer asked for is changed:

- each game is **2 sets to 25, capped at 27** (`bestOf 2`, `capPoints 27`). The
  test league had `[25, 15]` with no cap.
- first serve **6:45 PM Fridays**. The competition's own `start_time` had said
  19:00 while its weekly slot said 18:45; both now say 18:45.
- season **Fri 18 Sep → Fri 2 Oct 2026**: the same fourteen days as the test
  league, meaning two round-robin weeks and a playoff week
- 3 rounds a night, `rounds_per_team 2`: 6 games a team, as before

**Verified by diffing every column against the source**, not by trusting the
script's log. On `competitions`, only id, org, slug, status, dates, start time,
match format and created_at differ. On `league_settings`, only the courts and
weekly slot differ, which now point at the new venue. The draft matches row for
row on team, name, status, positions, grade and notes: 27 of 27, none missing,
none extra. Zero matches exist. The public name list returns 24.

**Three deliberate calls:**
- **Left as `draft` (unpublished)** until it has been checked. The test league is
  `open` with registration on. Publishing is one click, and doing it now would
  expose a league with no schedule.
- **The drafted "Liam Johnson" is linked to Liam's account**, with a
  `team_members` row on Team 1, which is the same write `place_free_agents`
  makes for a player who has one. His lineups and stats follow him from night one
  instead of starting under a bare name and being split later. This rests on a
  name match: he is the org's owner and the only Liam in the league.
- **Slug `big-shoots-volleyball-2026-2027-2`.** Slugs are globally unique and the
  test league holds the plain one. This is the app's own `uniqueSlug` rule.

**There is no "lock" on a draft to copy.** `place_free_agents` records a
placement as `status = placed` plus `placed_team_id`, and that saved placement
is the locked draft. The new league has exactly that.

**Access checked as Liam**, in a rolled-back transaction: `is_competition_admin`
is true through org ownership (`is_org_admin` counts owners), and he sees the
league, 4 teams and 27 players.

**Correction to an earlier note:** Liam *does* have access to the Test Org
league, as a named `competition_admins` entry granted 27 Aug. The first check
looked only at org membership and missed it.

**Rerun-safe.** A second dry run finds the venue, league, 4 teams and 27 players
all present and plans nothing new.

---

## 2026-09-14 — A drafted player is a player (migration 0120)

**Shipped.** Audited every place that answers "who is on this team" against Big
Shoots, whose draft is complete and correct — 24 players, six a side, three
still in the pool. The draft IS captured; most readers were looking in the
wrong table.

```
competition_player_names()          ->  0   public page + team-wide stats
team_members                        ->  0   roster lists, split payments
free_agents.placed_team_id          -> 24   the draft result
match_appearances (distinct people) -> 24   player stats
```

**`team_members.user_id` is NOT NULL**, so somebody without an account cannot
be a row in it. That is the whole reason the draft writes
`free_agents.placed_team_id` instead — not an oversight, a constraint. Which
means every reader has to take the union, and most did not.

**`competition_player_names` was the one that mattered**: it drives the PUBLIC
league page and the team-wide stats path, and it returned zero for a fully
drafted league. Migration 0120 adds a third branch for placed free agents.
Big Shoots 0 → 24, six per team; BVL unchanged to the row, since it has no
placed free agents and the counts are still exactly members + invites.

**Placed only, and never twice.** Somebody still in the pool has not joined a
team and publishing their name would expose a sign-up rather than a roster — the
same threshold every other branch uses. A `NOT EXISTS` keeps a drafted player
who does have an account from appearing under both branches.

**Stats never had this problem**, checked rather than assumed:
`match_appearances` stores `player_name` beside a nullable `user_id`, and
`identityKey` falls back to the normalised name. Replaying Big Shoots' real
appearances against a simulated 25–20 / 25–22 produced all 12 rows with no
accounts involved.

**Left alone deliberately**, with reasons recorded in HANDOFF: `getTeamRoster`
(shared with split payments, where a share needs someone who can pay it), the
waiver signatory list (signing needs an account), and Roster mix (a drafted
player's grade is a column, not an answer).

**One latent trap recorded**: `team_entry_blocked` counts `team_members` for
`min_roster_for_entry`. Big Shoots sets no minimum so nothing is held today, but
set one on a drafted league and every full team would read as roster short.

**Tests:** 1452 passing across 112 files.

---

## 2026-09-14 — The Players list reads both kinds of membership

**Fixed, same day as it shipped.** The Players tab read `team_members` only, so
Big Shoots — four teams, six drafted players each — showed "Nobody is on a
roster yet". The draft was correct; the query was looking in one of the two
places membership lives.

**Two tables hold "who is on this team", by design.** `team_members` holds
people with accounts, written when a captain's invite is claimed.
`free_agents.placed_team_id` holds people the organizer drafted — and
`place_free_agents` only writes a `team_members` row when that person has an
account, which none of Big Shoots' 24 do. `lib/queries/lineups.ts` already took
the union for exactly this reason, which is why "Record who played" worked on a
league the Players tab called empty.

**Unplaced sign-ups stay unlisted.** The three in the draft board's Available
column are not on a team, and the organizer was explicit that they do not have
to be. Only `placed_team_id` counts.

**Name is enough for now.** These are a testing phase with no accounts, so a row
is a name, with the email only when there is one — no dash, no empty line.
Positions come along from the sign-up, since the pool knows them and a
registration answer does not exist. Accounts come later, and the row shape
already carries `userId` for when they do.

**No edit pencil for a drafted player**, because answers are keyed by
`user_id` and there is nothing behind the button. It says "from the draft"
instead, which is the true reason rather than a form that saves nothing.

**Not changed: the Roster mix card.** A drafted player's grade lives in
`free_agents.skill_level`, not in a registration answer, so there is nothing for
it to tally — that is a different shape of data, not the same fix.

**Tests:** 1452 passing across 112 files.

---

## 2026-09-14 — An empty stats table that says which half is missing

**Shipped.** Big Shoots showed a scored match on the schedule, correct
standings off it, and a Stats tab reading *"Player stats appear once scores are
recorded"*. The score was already there. The sentence was sending the organizer
to redo the one thing they had done.

**The data was right; the message wasn't.** An appearance league credits a set
to whoever was on court for it, so a stat needs **both** a scored set and a
lineup on the same match. Big Shoots had a score on week 1 (Sep 1) and lineups
on week 2 (Sep 8/9) — 1 scored match, 6 with lineups, and **0 with both**. An
empty table was the honest answer; "record some scores" was not.

**`statsEmptyReason` names whichever half is missing** and keeps the original
wording for a team-wide league, where a score genuinely is all that is needed.
The case worth having a sentence for is the one Big Shoots hit: both kinds of
data present, never on the same game. Checked against all five live
competitions — the four BVL leagues (team-wide, nothing entered) keep the old
text, and only Big Shoots changes.

**Counted, not inferred from the empty list**, and only when the list is empty,
so a league with stats pays nothing for it.

**Two things found on the way, not fixed here:**
- Big Shoots' four teams have **0 `team_members`** while 24 free agents sit on
  them via `placed_team_id` — the known `place_free_agents` behaviour for
  drafted players with no account. The **Players tab and Roster mix card
  shipped earlier today read `team_members` only**, so both show nothing for
  that league. `lib/queries/lineups.ts` already has the correct union and is
  the model for fixing it.
- An accountless free agent has no `registration_answers` at all (they are
  keyed by `user_id`), so including them in the Players tab would list names
  that cannot be edited. That needs a decision before it needs code.

**Tests:** 1452 passing across 112 files.

---

## 2026-09-14 — Clearing a registration nobody finished (migration 0119)

**Shipped.** The last of BVL's three asks: "remove incomplete registrations so
they don't appear under the paypal section". Someone starts a registration, a
payment request is created, they walk away — and that row sat in the organizer's
inbox for good, beside the ones that represent real money waiting to be checked.
The inbox only ever offered **confirm**.

**No new status.** `cancelled` has meant "payer abandoned checkout or the
session expired" since migration 0064. What was missing was a way for an
organizer to say so.

**It needed a migration even though the status existed**, because
`registration_payments` carries SELECT policies and nothing else — every write
is a SECURITY DEFINER function, deliberately, so money changes have one
auditable door. `dismiss_offline_payment` refuses a card charge (Stripe's to
cancel), refuses a paid row and says "refund it instead", and returns **false**
rather than erroring on a second click.

**The team is deliberately left alone.** Dismissing a request is not removing
an entry — the team stays `pending_payment` and stays on the Teams list to be
chased or withdrawn, and `withdrawTeamAction` already exists for that other
decision. One button doing both would make a reversible act irreversible. 0102's
unique index only covers OPEN offline charges, so cancelling frees the team to
be sent a fresh link.

**A bug the data volunteered.** BVL's inbox had a free agent withdrawn six days
earlier whose $340 PayPal request was still sitting there — nobody was ever
going to pay it, and the organizer was being asked to tidy up after the app. A
trigger now cancels open requests when a team or free agent is withdrawn, from
whichever path does the withdrawing, and the migration corrected the row already
stranded. Pending offline requests went 8 → 7 on apply.

**Verified against the live database in rolled-back transactions**, as BVL's own
organizer: dismissing a pending row returns true and leaves it `cancelled`, a
second call returns false, a plain rostered player is refused by name, and an
already-paid row is refused with the refund advice. The live row was untouched.

**Tests:** 1446 passing across 111 files.

---

## 2026-09-14 — A Players tab, and an organizer who can correct it

**Shipped.** BVL's secretary asked for "access to player data (to add phone
numbers, tweak spellings, etc.)". There was none: an organizer could set the
questions and read none of the replies. `getAllAnswers` had been written for an
export and **never called by anything** — the questions went in, the answers
went nowhere.

**A Players tab**, beside Teams: everyone on a roster with their answers, a
search box, and an edit dialog per person. Driven off the ROSTER rather than
off the answers, so somebody who joined a team and filled in nothing still
appears — they are exactly who an organizer is hunting for.

**No migration.** Migration 0104's write policy on `registration_answers`
already allowed a competition admin to write any answer in their own
competition; the block was entirely in the server action, which hardcoded
`user_id: auth.uid()`. So the fix was a second entry point, not a schema
change.

**Proved against the live database rather than assumed**, in a rolled-back
transaction as V's own account: an org admin can update another player's answer
and read all 355 in the competition, and a plain rostered player attempting the
same update gets zero rows. RLS is doing the work; the check in the action is
so the refusal is a sentence instead of an empty result.

**One write path, not two.** The player saving their own answers and an
organizer correcting them now share `writeAnswers` — scope filtering, blanking
a cleared field, and the address lookup are identical, and a second
implementation of any of them is a second chance to get it wrong. Scope is
forced to `player`, so this can never reach a team answer.

**Of the secretary's three asks, one was already built**: removing someone from
the draft/free-agent pool. `setFreeAgentStatusAction` withdraws them, clears
the placement and deletes the roster row — the button is on the free agents
card in the Teams tab. Still missing: dismissing an incomplete registration
from the offline-payments inbox, which only offers "confirm" today.

**Tests:** 1446 passing across 111 files.

---

## 2026-09-14 — The signature beside the name, where they disagree

**Shipped.** The organizer wanted to see both the name the league holds and
what the player actually signed. A waiver records `signed_name` — what was
typed into the signature box — which is a **third** thing, neither the account
name nor the registration answers, frozen alongside the checksum of the exact
text they were shown.

**It is evidence, so nothing rewrites it.** The signing form pre-fills the box
with the account name and 90 of 98 BVL players left it as it was, but 8
overtyped it — and several of those typed their FULL name, so the legal record
was already better than the list that was showing "Rob" and "Sharon V.".

**Shown only where it disagrees with the name on file.** Printing both on every
row is the same name twice, ninety-seven times, and would bury the four that
differ. Case and spacing are ignored — "Sarah logozzo" against "Sarah Logozzo"
is a person signing their own name, not something an organizer needs to look
at.

**Across all 101 live signatures that leaves four**, and every one is worth a
look: Francisco Chavarria signed "Francisco", Cecile Alleyne signed
"Cecile A.", Jenn Sheldrake Sundar signed "Jenn", and John Lewis signed
"J. Lewis" — the last being the only person who signed SHORTER than the name
already on their account.

**Tests:** 1446 passing across 111 files.

---

## 2026-09-14 — Organizer lists show the name the league asked for

**Shipped.** BVL's waiver list read "Rob", "Steve", "Sharon V." — first names
and initials — even though First name and Last name are required questions and
**every one of the 95 players answered both**. Nothing was missing. The list
was reading the wrong field.

**Two names exist for the same person, and they are not interchangeable.**
`users.display_name` is the ACCOUNT name — what teammates and the public see,
and deliberately thin since migration 0077 let players choose how they appear.
The First/Last answers are what the league asked for. An organizer chasing a
signature needs the second; "Rob" does not distinguish two Robs.

**So organizer-only surfaces resolve through the answers and nothing else
changes.** The waiver signatory list and the answers export now do;
`getTeamRoster` deliberately does **not**, because it feeds the team page and
split payments, where a teammate would then see a full legal name the player
chose not to show. That line — organizer sees what the league asked for, the
public sees what the player chose — is the whole design.

**Found by label, with the same reasoning as `suggested_player_answers`
(migration 0106).** There is no "name" question kind: First name and Last name
are an editable starter preset, plain short text. The match is EXACT after
normalising, so "Last name of emergency contact" doesn't match, and a league
that renames the field falls back to the account name — which is today's
behaviour, and so the safe direction to fail.

**The first version of this was a worse bug, and the live data caught it.**
Preferring the answers unconditionally rewrote "Rachel da Cunha" as "RACHEL DA
CUNHA", turned "Kelly A Walker" into "Kelly Walker" and dropped the middle name
from "Bobbi Lynn Brake" — 20 changes, several of them regressions. The rule is
now **fill in, never restyle**: the answers are used only when they carry a
surname AND the account name is one word or ends in an initial. Names are not
something to normalise algorithmically; every rule for it breaks on VanEerden,
McCormack or da Cunha.

**Re-checked against all 95 live rows: 11 filled in, 84 untouched, no
regressions.** Rob Sleigh, Sharon VanEerden, Steve Grootenboer, Cecile Alleyne.

**Tests:** 1442 passing across 111 files.

---

## 2026-09-14 — Roster mix: how each team splits

**Shipped.** Brampton asked to see each team's sex split on the registration
page — a co-ed side that turns up with no women cannot field a legal lineup,
and September is when an organizer can still do something about it.

**No migration, and no new question.** BVL already asks it: a required
per-player **Gender** select (Male / Female / Non-Binary), 73 answers across
three leagues. This is a rollup of data that was already there, so the whole
feature is a query, a tally and a card.

**It does not look for a question about sex.** Any per-player multiple-choice
question is tallied and the organizer picks which to read. Matching on the
label — "gender", "sex" — would break the day a league words it differently,
and would fail by quietly summarising the wrong question rather than visibly
doing nothing. As a side effect BVL also gets their **Skill level** spread,
which is the other thing they balance teams on.

**"Not answered" is its own column**, never folded into a choice — same rule as
the locality card. A team reading "4 men" when two people simply haven't filled
the form in is precisely the number an organizer must not plan around. Every
row adds up to the roster size, and there's a test pinning that.

**An answer that outlived an option edit is kept, not dropped.** Options are
editable after people have answered, and discarding a stray would leave the
columns silently failing to total the roster. It gets its own column, after the
declared ones.

**Counts only — never who answered what.** The organizer can already see
individual answers elsewhere, so this adds no exposure; it just has no reason
to repeat it on a page meant for scanning.

**Verified against the live database before shipping**, not just in tests: all
four BVL leagues tallied, every row adding up. Rough Sets reads 3 Male / 2
Female, which is the kind of row the card exists to surface.

**Tests:** 1424 passing across 110 files.

---

## 2026-09-14 — The gate explains both reasons, not one

**Shipped.** A BVL captain asked why their team said "Waiting on the waiver"
when everyone had signed. The signatures were fine — the screenshot predated
four of them by an evening. What the investigation found instead is that the
team page could only explain ONE of the two reasons a team is held back, and it
was the reason that no longer applied to anybody.

**`teams.status` says `pending_waiver` for both reasons**, because that is all
the scheduler needs to know. `team_entry_blocked` (migration 0101) already
returns which one it is — roster or waiver — and the UI was throwing that away.

**Rough Sets, at the moment of asking:** 5 rostered, all 5 signed and counted,
`min_roster_for_entry` 6. So the waiver gate correctly returned null, the page
fell through to **"No matches yet"**, and the captain was told nothing at all.
That is the exact lie by omission the gate's own docstring says it exists to
prevent — it just only prevented it for signatures.

**Scale: 40 of 40 held BVL teams are held for ROSTER. None for waiver.** The
only explanation the app offered was, right now, explaining nothing to anyone.

**The decision is pure and mirrors the database** (`lib/teams/entry-gate.ts`),
including the ORDER of the checks — roster first, then signatures. If the two
ever disagree, the page explains one reason while the database enforces
another, which is worse than explaining nothing; there is a test pinning that
ordering with a team that is both short and unsigned.

**The roster message needed a control to point at.** It says the captain can
add players from the roster below, and until now that list was read-only —
`InviteTeammateDialog` existed but only appeared in the organizer's management
view. It is now on the team page too, gated to match `inviteTeammateAction`
itself (captain or organizer), so the sentence is actionable rather than
merely true.

Most of those 40 teams sit at 1 of 6 because captains could not invite anyone
until migration `0055` was applied on 09-11. They can now; many haven't yet,
and this is the screen that tells them.

**Tests:** 1412 passing across 109 files.

---

## 2026-09-14 — The gym package, printed

**Shipped.** `scripts/smva-sample-sheet.ts` renders Scarborough's whole night —
a cover plus one sheet per tier — from the app's own data: the pinned pod grids,
the 2026/27 roster, `movementLabel`, and `SMVA_SHEET_NOTES`. Print-to-PDF via
headless Chrome. Nine pages for nine articles, which is also the proof that no
tier overflows its page.

**Court, time and games — not their grid.** The organizer asked for exactly
that, so a 6-team tier is fifteen rows of `Time · Court · Home v Away` with the
score boxes inline, rather than a courts-as-columns matrix. The score-entry half
of the sheet is unchanged in spirit: per-game boxes, then Total Points and Rank
per team, then the officials line.

**Games per match is DERIVED, not read off the title.** Every game is worth 2
points, so `totalPoints = fixtures × games × 2`; the renderer computes it and
throws if it disagrees with the template's own title. A template whose title and
total drift apart now fails loudly instead of quietly printing the wrong number
of score boxes.

**It is in the repo because rendering catches what unit tests cannot.** 29 tests
passed while `resolveDuty` was printing "VOID 4-minute warning" for the
organizer's "A 4-minute warning"; one rendered page found it. This run
re-confirmed the fix — the article survives, and `Team {D}` resolves to MESLA
CONSTRUCTION, INVICTUS, TRAFFIC and so on, tier by tier.

**The cover states the three inferences rather than hiding them**: the
Bethune/King slot-order discrepancy, OUTTAHAND's placement at PPL, and the
borrowed scoring line on the 5-team adjustment grid. They are questions for
their executive, and burying them in a schedule that looks authoritative is how
they go unasked.

**Still not the shippable path** — the in-app print route is unbuilt, and this
generator writes a file rather than serving one.

---

## 2026-09-13 — Scarborough Men's: their paper sheet, as data

**Shipped.** SMVA run eight gyms a night off a printed package, and their
executive's test for any system is whether it prints the same page. Thirteen
commits of getting their format in, ending with both migrations applied.

**Their ladder needed no engine change.** Eight tiers in one linear chain
(1 → 2A → 2B → 3 → 4 → 5A → 5B → 6) is exactly what `applyLadderMovement`
already does; the only thing missing was the order itself and the per-boundary
swap counts. Two tiers sharing a number is a naming convention, not a branch.

**The pod grids are pinned as DATA, not generated** (`lib/scheduler/
pod-templates.ts`). Four teams over 2 courts in 3 slots, six over 3 courts in 5
— every pair meets once and nobody sits, which is the property their grids were
hand-built for and a generator would have to be argued into. `kind` separates
the two regular sizes from `POD_5`/`POD_7`, which only run when a gym falls
through and somebody has to sit.

**Games per team is not matches per team**, and the sheets say so: a 4-team
night is 3 matches × 3 games (45-minute clock, 36 points), a 6-team night is 5
matches × 2 games (26-minute clock, 60 points). Both land on ~150 minutes with
nobody sitting — that symmetry is why the clocks are 45 and 26 rather than
round numbers, and it's recorded in the tests so nobody tidies them.

**The 2-points-per-game rule was derived, not invented.** Their printed totals
(60 and 36) only work at 2 points a game, which let the 5- and 7-team totals be
*computed* (40, 84) rather than guessed at.

**Overall standings are golf scoring** (`lib/scheduler/ladder-overall.ts`):
position across the whole league, lowest total wins, ties share a seed. A team
winning tier 3 sits below a team finishing last in tier 1, which is the point of
a ladder.

**The printed sheet drops the letters.** Their grid says "A vs C" with a legend
because you cannot rewrite six team names into a printed grid by hand every
week — it's an artefact of paper. `buildGymSheet` keeps the letters inside the
template as the stable shape of the grid, binds them to teams in seeded order,
and prints names. It returns **null** for a pod size with no pinned grid:
the gym runs off this sheet, and an invented schedule is worse than a missing
one.

**A bug worth keeping in mind: 29 tests passed over it.** `resolveDuty`
replaces bare letters, which is right for template text we author ("A and B
setup courts") and catastrophic for organizer prose — their "A 4-minute warning
will be given" rendered as "VOID 4-minute warning". Organizer text now uses
`{A}`–`{G}` placeholders instead (`resolvePlaceholders`). Nothing in the unit
tests found it; **rendering the sample sheet did.**

**Two things the printed package carried that the app had nowhere to put** —
migration `0118`: `league_settings.sheet_notes` (titled instruction blocks, as
an ordered array because the sheet prints them as headed sections) and
`ladder_night_officials` (names, not accounts — these are volunteers who mostly
have none, and requiring one would mean the night goes unrecorded).
`parseSheetNotes` **drops** a malformed block rather than repairing it, because
the destination is a print layout where a headless section is a gap on the page.

**Migration `0117` is the one that makes it usable at their scale:**
`result_rank` + `result_points` on `ladder_placements`. Their organizer was
explicit — *"for the app we don't need to input each score, just the final
standings at the end of the night"* — and the movement engine never wanted the
scores anyway, only the ranked list. Both columns nullable, so a league that
enters every set is ranked from its matches exactly as before and one league can
do both, week by week.

**Org and league set up for real**, not seeded: the org is owned by their
organizer (created for them, then recreated under their ownership after a
deliberate delete — an org belongs to the person who runs it), 7 venues geocoded
through Places `searchText`, 8 tiers, the 40 returning teams, and the season's
dates and blackouts. **Leacock is two venues, not one** — two double gyms, two
courts each — because court identity is `(venue, label)` and one venue with four
courts would let the generator put a game on a court in the other building.

**Courts became a count per gym.** The venues card assigned courts one at a
time, which is fine for a 2-court league and absurd for seven gyms; it's now one
row per gym with a count, a start time and prime-court chips.

**Both migrations applied and verified** against the live database today, and
`lib/db/schema.ts` now mirrors them — it had drifted, since `0117`/`0118` are
hand-written and drizzle-kit never sees them.

**Tests:** 1402 passing across 108 files.

**Next:** the rank + total-points entry UI per tier per week (the storage is now
there), `lockLadderWeek` preferring a typed rank over a match-derived one, and
the gym-sheet print route in the app — it exists only as a one-off generator.

---

## 2026-09-12 — Settings stops being one long scroll

**Shipped.** A league's Settings tab had grown to fourteen cards in a single
column. An organizer opening it to change the entry fee scrolled past the
ladder wizard, the court list, the waiver picker and an audit log to get there,
on a phone, every time.

Grouped into five sub-tabs by **what an organizer came to do**, not by what the
data happens to be: Registration (the pitch, individual sign-ups, questions,
locality, waiver), Payments (fee, offline inbox, ledger), Format (ladder,
scoring), Courts & venues, and Admin. Registration leads because it is the one
touched daily while sign-ups are open; Format and Venues are set once at
creation and sit behind.

**`OrganizerTabs` gained a `nested` variant.** Two identically-styled tab bars
stacked read as one broken bar, so the inner one is smaller and lower-contrast
— subordinate to the page's own tabs rather than competing with them.

**The Admin tab is only offered to someone who can use it.** Every card in it is
gated on `canManage`, so for anyone else the tab would have opened on nothing,
which is worse than the scroll it replaced.

**The tournament page was deliberately left alone.** Its Settings has seven
sections, not fourteen, and splitting that into four tabs holding one card each
would add clicks without removing much scroll. Consistency is not worth a worse
page.

No behaviour changed — every card is the same component with the same props,
moved rather than rewritten, by slicing the existing JSX rather than retyping
it.

---

## 2026-09-11 — Placing an address somebody typed

**Shipped.** BVL's "Where players live" card read *Not known* for 5 of 10
Thursday teams, and the organizer reasonably read that as "we can't find the
address". Nothing was missing: all 22 captains had answered. The split was
purely how they answered — 14 tapped a Google suggestion and got structured
components back, 8 typed a line and there was nothing structured to read.

`addressLocality` refuses to guess a town out of free text, which is right —
`130 Brampton Road, Toronto` contains the word and means the opposite. But
refusing to guess is only the correct answer when nobody can find out. We can:
the lookup those eight never triggered is one server-side call on a key that
was already enabled.

**Places `searchText`, not the Geocoding API**, deliberately — same API already
live on this key, so nothing new has to be switched on in Google Cloud. Biased
the same way as the autocomplete, so a half-typed street resolves near the
league rather than to the same street name in another country.

**Ambiguity still reports nothing.** Two candidates naming two different towns
means the line genuinely is ambiguous, and a quiet guess is exactly what the
module exists to avoid. It asks for two results, not one, purely to be able to
notice that disagreement.

**A geocoded town is marked as one** rather than passed off as the player's own
selection. `LocalitySource` gains `"geocoded"` beside `"structured"`, because an
organizer counting residents deserves to know which of them said so themselves
and which Google matched. Nothing in the tally changes; the distinction is
recorded for when it matters.

**The dry run justified the caution.** Nine answers resolved, none ambiguous —
and they were not all Brampton, which is what I had assumed from eyeballing
them. `39 Humbershed Crescent` is **Caledon**; `7 Northampton Drive` is
Toronto. Had the text fallback been loosened to "guess from the street" instead,
BVL's resident count would have been quietly wrong in the organizer's favour.

New answers geocode at save time, best-effort — a slow or failed lookup leaves
the answer exactly as typed, because nobody's registration should fail over a
map query. The rows already in the database need the one-off backfill:
`! npx tsx lib/db/backfill-localities.ts` to preview, `--write` to apply.

12 unit tests, including the real BVL strings and the refuse-to-choose case.

---

## 2026-09-08 (later still) — The registration emails a BVL captain actually needed

**Shipped.** An organizer reported that confirming your email dropped you on the
home page with no idea how to finish registering, and asked for emails carrying
their own branding and league details. Three changes, in increasing order of
how much they required.

**The redirect was not broken where it looked broken.** The destination already
rode the whole chain — `/signup?next=` into `emailRedirectTo` into the callback
— and reading it end to end, it was correct. The link we do not control is
Supabase's: it validates `emailRedirectTo` against the project's Redirect URLs
allow list and, on no match, **silently substitutes the Site URL**. The code
then lands at `/` where nothing spends it. That allow list still wants fixing
in the dashboard, but the flow should never have depended on a setting
invisible from the code, so two fallbacks now sit behind the URL: middleware
forwards any page carrying an auth code to `/auth/callback`, and sign-up writes
the destination to a short-lived `pending_registration` cookie the callback
reads only when the URL has lost it.

Two details worth keeping. A bare `code` is treated as auth **only** when
shaped like a PKCE UUID — "code" is a plausible name for a discount or referral
code on a page of ours, and hijacking those would be a worse bug than the one
being fixed. And the cookie is `SameSite=Lax` by necessity, not by habit: the
click is a top-level GET from a mail client on another origin, which `Strict`
would withhold the cookie on.

**Nothing was emailed to a captain who finished registering.** Their teammates
got invites, so the one person who did the work heard nothing back and the
organizer was fielding "did that go through?" by text. There is now a branded
confirmation with the details a captain will not remember in a month — night
and time, season dates, venue, fee — and, when anything is outstanding, a
checklist that leads. That ordering is the point: a team admitted pending
payment is **not** entered, and "you're all set" to a side that still owes a
waiver is how it turns up to a schedule it is not on.

**Branding is per organization, not per platform.** A player signed up for BVL,
not for MySportsApp. `EmailLayout` gained an optional `brand` — the organizer's
logo above the heading, their name in the footer, a reply-to of their own
address — because the questions these emails prompt are theirs to answer, and a
noreply turns each one into a phone call.

**The confirmation email itself needed Supabase's Send Email Hook**, since its
own template is one global thing for the whole platform and can carry neither a
logo nor a league name. We now render and send it through Resend. The
unexpected payoff: sending it ourselves means the link points straight at our
own callback with the token hash, so the Redirect URLs allow list **stops being
able to break the flow at all**. Standard Webhooks signature verification is
written out against `node:crypto` rather than pulled in — it is twenty lines,
and the alternative was a dependency on the critical path of every sign-up.

**That route is the most dangerous thing here**, and is built accordingly: with
the hook enabled, a failure fails the sign-up. Everything decorative degrades
instead of throwing — a branding lookup that dies still sends the email,
unbranded — and only a bad signature or a send that did not send is allowed to
fail the request. **It is not switched on yet**; the two dashboard steps, in the
order that avoids breaking every sign-up on the platform, are in `HANDOFF.md`.

**One gap, stated rather than hidden.** The email templates have no automated
render test. `tsconfig` sets `jsx: "preserve"` for Next and Vite reads that for
`.tsx`, so vitest cannot parse a template — no test in this repo had imported
one before. Both new templates were verified by rendering them directly under
an overridden JSX setting, but that is a check I ran, not one CI will re-run.
Closing it needs `@vitejs/plugin-react`, which is a dependency decision rather
than something to slip into this change. 33 unit tests cover the parts that
could be tested: the stray-callback detection, the summary and checklist logic,
the signature verification, and the hook payload parsing.

---

## 2026-09-08 (later) — The docs catch up, and stop falling behind

**Shipped.** No product change. A machine restart prompted a check of what was
actually pushed, which turned up nothing lost — and two documents describing a
repo that had stopped existing three weeks earlier.

- **`PROGRESS.md` was 80 commits stale** (last entry 2026-08-22) and still
  ended on "Next: Slice B — paid registration", which shipped long ago. Now
  covers 2026-08-24 → 2026-09-08. Those entries are reconstructed from commit
  history rather than written live, so they are shallower than the ones written
  in the session that shipped them.
- **`HANDOFF.md` claimed migrations were "written through `0073`"** when `0116`
  was live — 43 migrations unrecorded. Rather than assert they were applied, a
  throwaway script parsed every migration from `0074` on for the objects it
  creates and checked each against the live database. **All present.** Two
  findings recorded so the next audit doesn't re-investigate them: `0079`'s
  `one_open_etransfer` index is absent *by design* (`0102` replaces it with the
  broader `one_open_offline`), and `0075`/`0109` create no schema objects at
  all, so an existence audit finds nothing in them.
- **Nothing is pending against the database.**

**The interesting part is why it drifted.** `CLAUDE.md` already said to update
`PROGRESS.md` every session. An instruction nobody is reminded of is a
suggestion, so this adds a check that runs: `scripts/docs-staleness.sh` counts
non-merge commits since each file was last touched, wired to `SessionStart`
(injects the state into context, so a session opens knowing) and `Stop`
(reminds the user). Thresholds differ because the files differ — `PROGRESS.md`
warns at 1 commit, `HANDOFF.md` at 10, since one is a per-session log and the
other a state snapshot that legitimately goes longer between edits.

**The `Stop` hook is deliberately non-blocking.** A blocking one can trap a
session in a stop/continue loop, and a documentation reminder should never be
able to do that; the script also exits 0 silently on any error for the same
reason. It proved itself immediately — the first run after the hook landed
flagged the hook's own commit as unlogged, which is this entry.

**Still parked:** off-platform backups. Confirmed today that the workflow is
`disabled_manually` and **zero** of its six secrets are set, so the nightly
backup has never run. Steps are in `HANDOFF.md`; it needs a passphrase and S3
credentials that only the owner can create.

---

## 2026-09-08 — Ladder weighting, and cleaning up what players see

**Shipped.** A ladder season can now be scored by the tier each week was played
in, and several things players shouldn't have been seeing are gone.

- **Weight a ladder season by tier** (`024d464`, migration `0115`). Three set
  wins in Tier 1 is a harder night than three in Tier 2, and a plain table
  called them equal. Weights live per DIVISION, not as a global rule — the
  numbers are the organizer's, and a three-tier league needs a third pair
  nobody can predict. Null means *unpriced*, deliberately different from zero:
  an unanswered question, so the table skips it rather than telling an
  organizer the team earned nothing.
- **Show the weighted table to players** (`cc69385`), not just the organizer.
- **A team keeps its captain, and a captain enters once** (`9e2e6f1`,
  migration `0114`). Nothing stopped the same person entering twice — and the
  way it actually happens isn't fraud, it's a captain abandoning registration
  at PayPal and starting again rather than finding the team they already made.
  Scoped per COMPETITION, like the team-name rule, because one person
  captaining a Tuesday and a Thursday team is ordinary. Withdrawn teams are
  excluded, so an organizer removing a team frees that captain.
- **Keep the sandbox org out of public search** (`2e37267`, migration `0116`).
  Test Org's dozen sandbox competitions were listed on `/find` beside real
  leagues, and a duplicate of a league you already play in looks like the real
  one. *Not* solved by marking them private — private also breaks the direct
  link, and being able to send somebody a link to what you just built is the
  entire point of a sandbox. So: hidden from the index, unchanged everywhere
  else, at org level.
- **Hide finished events from the find page** (`7e740ad`).
- **Both auth doors on registration** (`8e9f97b`) — "create an account" beside
  "sign in", and **keep captains on their registration through signup**
  (`b40ede1`), so the round trip doesn't lose their place.
- **Point at the public org link from the org page** (`d8bba4b`).

---

## 2026-09-07 — Registration, rebuilt: PayPal, waivers, questions, addresses

**Shipped.** The largest single day in this log — 28 commits and migrations
`0102`–`0113`. Registration went from "enter a team name" to a stepped flow
that collects what an organizer actually needs.

- **PayPal, for organizers with no Stripe** (`0b94d17`, `13c5fef`, `1050fbe`,
  `45299f8`; migrations `0102`, `0103`). Collect by the organizer's own PayPal
  link; hide card payment entirely when they have no Stripe, and stop quoting
  them card fees they can't charge. `0102` also replaced `0079`'s
  e-transfer-only "one open charge" index with a broader `method <> 'card'`
  one — same rule, wider net.
- **Register in steps** (`5c59ce5`): name, waiver, pay, then teammates. Plus
  **split the two sign-up paths** and let a league cap its teams (`6aa65e2`).
- **Registration questions** (`3f2638a`, `b6a51a2`, `c5c5296`, `dcb7802`;
  migrations `0104`, `0106`, `0112`) — asked of the *right person*, with a
  player's previous answers offered back when they sign up again.
- **Waivers tightened** (`0faa2d3`, `2fd0f00`, `7298c61`, `e5bcd83`,
  `4d5e41a`; migrations `0107`, `0108`): initial each clause then sign it, the
  signer's own details in the waiver text, one team name per competition,
  chase outstanding waivers, and stop showing a blocked team a schedule.
- **Addresses** (`9d4d634`, `92a9985`, `8991049`; migration `0109`): suggest
  them without insisting, fetch the postal code on pick, and stop the
  browser's own autofill list opening on top of ours.
- **Home locality** (`0d0af70`, `7f9ecb0`; migrations `0110`, `0111`) — count
  how many of each team live in the league's own town, with the town set once
  at organization level.
- **One public page for everything an organization runs** (`fa005de`).
- **Registration stage on the team itself** (`94f595c`, `350d228`), and
  **record the reference an organizer matched a payment against** (`327753b`,
  migration `0113`) — kept apart from what the payer *claimed*, because the
  difference between a claim and a finding is the point of confirming anything.
- Smaller: **cap individuals** (`bd1adc8`, migration `0105`), **banner shown
  whole** with a real upload error (`840539e`), **card titles wrap** instead of
  truncating (`18bf901`).

---

## 2026-08-31 → 2026-09-02 — Waivers, the player dashboard, and the legal pages

**Shipped.**

- **Waivers** (`c707363`, `cfeedef`, `8a7b26b`; migrations `0100`, `0101`) —
  an organization's approved text, who agreed to it, and the rule that a team
  isn't an entrant until its players have signed.
- **A player dashboard** that answers the questions players actually have
  (`e00c97e`).
- **Privacy policy** with a contact that works and the facts BVL asked for
  (`aa64b2e`), and **a `/security` page** so this only has to be written once
  (`b5d2c85`).
- **Playoff naming** (`2148de5`, `c5e9242`, `88aafcd`): number the games so
  "Winner of QF2" points at something, name the feeding game rather than its
  bracket number, and say which playoff game it is on the schedule.
- **`29337d2`** — stop calling it `nextTuesdayAfter` when the league plays
  Thursdays.

---

## 2026-08-27 → 2026-08-30 — Reverse Pairs, the draft board, and event images

**Shipped.** A new format end to end, plus the tooling Big Shoots needed.

- **Reverse Pairs** (`0bee943`, `c562a36`, `7a34d2d`, `379d518`, `f9218d2`;
  migrations `0092`, `0096`, `0098`) — scheduler, public page, settings, fees
  and self-serve registration.
- **Drag-and-drop draft board** (`02bdeb1`), **serpentine re-draft and a
  3rd-place game** (`7d7919f`; migrations `0093`, `0094`), **free agents
  grouped by position** (`a07fa1d`), and **fixture order an organizer can read
  off the wall** (`380cad7`).
- **Appearances** (`c0b710e`, migration `0089`) — score a drafted league by who
  actually turned up. **Rebuild Big Shoots** to the organizer's real format and
  let him add players (`04bee25`, migration `0090`).
- **Event images** (`87a537b`, `183d167`, `98e041e`; migrations `0087`, `0088`)
  — organizers upload a banner and logo instead of hosting one themselves.
  Authorisation moved to the **server**, not the browser, and the platform
  admin can upload for orgs they don't belong to.
- **The hidden-league bug is per TEAM, not per league** (`3e83e54`, after
  `8018aec` fixed the wrong half) — a league waiting on its playoff draw was
  disappearing.
- **Two-night league playoff** where nobody's night ends after one game
  (`7163dbf`), showing the whole playoff with prime courts to top seeds
  (`c2b09a2`), and **standings get a column per game** (`644e833`).
- **Platform fee waiver, per event** (`deac8f0`, migration `0097`), and
  **don't link to a public page that doesn't exist** (`bef1bbe`).

---

## 2026-08-25 → 2026-08-26 — The home page, destructive-op guards, and backups

**Shipped.** A rebuilt front door, and three layers of protection for data that
was one click from gone.

- **Home page rebuilt around the product** and unpinned from one city
  (`7dbb47f`), then **two front doors, a scheduler you can drag, and counts we
  actually count** (`5e028f0`, migration `0084`). **`9a4e6cc`** fixed the 500 it
  shipped with: `unstable_cache` can't read cookies.
- **Regenerate must not silently destroy a played season** (`2ff23d6`), then
  **regenerate redraws only the remaining weeks — erasing a season needs the
  name typed** (`7149353`).
- **The match audit is real, and outlives what it audits** (`eb87dae`,
  migration `0085`).
- **Restore points** (`1deab46`, migration `0086`) — an undo for the operations
  that delete a season.
- **Nightly encrypted database backups, stored off Supabase** (`825ff8f`) —
  then **parked, disabled, until its secrets exist** (`9f84d9d`). *Still
  parked; see `HANDOFF.md`.*
- **`a534bc0`** — the waitlist cron runs daily, not hourly (Vercel Hobby limit).

---

## 2026-08-22 — Embeds take the host site's colours

**Shipped.** Mango's site is white and #feb62a, and the embed arrived in our
cream-and-claret palette. `?accent=` and `?bg=` now theme it.

**Query params, not stored settings.** The person doing the work is the host
site's developer, who can edit a URL far more easily than get into an
organizer's account — and it keeps the theme per-embed, so one league shown on
two sites can match both.

**A brand colour is not automatically a readable colour**, which is why this is
a module with tests rather than a substitution. #feb62a on white is **1.9:1**,
against the 4.5:1 body text needs; using it where the app uses its accent would
have produced a standings table nobody could read. So the accent is split: the
colour itself for FILLS, with text chosen to sit on it, and a darkened variant
(#9a6e19) where the accent has to BE text. A test asserts red still leads and
blue still trails, so it darkens rather than drifting to brown.

**Untrusted input into CSS**, so anything not provably a hex triple is discarded
rather than sanitised — there is no such thing as a nearly-valid colour. 18
tests, including `red;background:url(evil)` and `"><script>`.

**Two mistakes worth recording.** I first put the theming in the embed LAYOUT;
`tsc` passed, but App Router layouts don't receive `searchParams` — only pages
do. Caught by testing the built output rather than trusting types. And my first
injection check grepped for `script>`, which matches Next's own hydration tags,
so it "failed" meaninglessly; the real check confirms both hostile strings
appear only inside the RSC payload, JSON-escaped and inert.

**Verified against mangosportsco.ca/test-page:** the iframes are installed
correctly with the right URLs and params. Production ignores them because this
isn't deployed — the redeploy is still outstanding, and now gates three things:
live Stripe keys, the waitlist expiry cron, and this.

---

## 2026-08-21 (later still) — Waitlist, end to end

**Shipped.** The database layer landed earlier today; this is everything that
makes it a feature. A full tier or competition now offers a queue instead of a
dead end.

**A team joins** from the registration page, which asks for a name and an email
and nothing else — this is an expression of interest, not an entry, and nobody
should fill in a six-person roster for a place they may never get. Only tiers
that are actually full are offered; one with room takes a normal registration.
Someone already queued sees their position instead of a second form.

**A spot is offered, not filled.** When a team is removed or withdrawn, the next
in line is offered it automatically and emailed a claim link with a deadline
(`waitlist_claim_hours`, organizer-set, default 48). Both exits are hooked —
missing one would mean half the waitlist silently never fires.

**Claiming is a button press, not a page load.** Mail clients and link scanners
pre-fetch URLs; a claim that fired on mount would register a team on someone's
behalf before they'd read the page.

**Expiry is hourly cron, not lazy.** The common case for a full league is that
nobody opens its registration page for days — exactly when a held spot most
needs to move on. One statement retires lapsed offers and reports which queues
freed up, so an offer can never expire without its spot being re-offered.
Hourly because the window is measured in hours; a daily sweep would add up to
24 hours of dead time to every lapse.

Verified against the live database — 12 further checks on top of the earlier 16,
covering per-tier fullness (a capped tier full while the competition isn't),
refusing to queue for a tier with room, one live entry per captain, the
organizer's claim window being honoured, an outstanding offer keeping the tier
full, the claimed team landing in the right tier as a normal entrant, and
requeueing a lapsed entry.

---

## 2026-08-21 (later) — E-transfer, end to end

**Shipped.** Teams can now pay the organizer directly by bank transfer instead
of by card. The organizer gives an address; that address IS the switch, so there
is no second flag to disagree with it.

**The money is different, so the math is different.** A card payer is grossed up
to cover Stripe and our platform fee, so the organizer nets their price. An
e-transfer has no processing to cover and we never touch it, so the payer sends
exactly price + tax. `planEtransferCharge` is pure and tested; e-transfer costs
the payer LESS than the card route for the same fee, which is the honest
outcome.

**The platform fee is recorded as owed, not waived** (owner's call). Waiving it
would make e-transfer the rational choice for every organizer and take card
revenue with it. It sits on the row as a debt, `platform_fee_settled_at` marks
it collected, and the organizer sees a running balance.

**Confirmation records an amount, not a tick.** Part payments are ordinary — a
team sends what it has and settles later — and "they paid" when $50 of $350
arrived would admit a team that hasn't. The database decides admission with the
same "sum every payment against the price" test the card path uses, so a team
that part-paid by card and part by transfer is handled correctly.

**No webhook exists for money that moved between two banks**, so the organizer's
inbox is the only settlement path. That's why it's a card on the payments tab
rather than something buried.

Migrations `0083`; 15 checks against the live database covering the obligation,
double-submit, non-organizer refusal, part payment, double-confirm, promotion on
full payment, and the fee ledger. 7 unit tests on the charge planner.

Also fixed a dead assertion I wrote in those tests — `.not.toContain?.()` on a
number silently no-ops, so it was asserting nothing.

**Next:** the waitlist's second half (UI, emails, cron). Its database layer
landed earlier today.

---

## 2026-08-21 — Per-tier caps, tier venues, and payment copy that isn't wrong

**Three things, one theme: the organizer needs to say something the app
couldn't store.**

**Payment copy.** Every blocked checkout said "the organizer hasn't finished
setting up payouts" — wrong in the common case and actively misleading. Payouts
are NOT what gates taking money: `canAcceptPayments` reads `chargesEnabled`,
and `payouts_pending` deliberately still accepts payments, because Stripe holds
a first payout for a week or two and registration mustn't stop. An organizer who
had simply never connected Stripe was described as though waiting on a bank
verification. It misled the owner, and it misled me. `cardPaymentBlockedReason`
now says which of the four states it actually is. 7 tests, one of which asserts
no blocked message mentions payouts.

**Per-tier registration caps** (migrations `0079`, `0080`). Courts are split
between tiers, so "12 teams" and "4 per tier" are different limits and both can
bind. Enforced inside `register_team` beside the competition total, so two
captains racing for a tier's last spot can't both take it, and after the
division-exists guard so an unknown tier still reads as unknown rather than
full. Withdrawn teams free their spot. Verified against the live DB.

**A tier can now be pinned to a gym.** `divisions.venue_id` has existed since
migration 0072 and the league generator has always honoured it — every match in
that tier gets that building, its courts and its start time. **Nothing in the
app ever wrote the column**: read in one place, set in none, and all 20+
divisions across every org had it null. The tiers dialog now carries a gym
picker and a cap per tier.

**Next:** e-transfer as a payment option. The owner's call on the platform fee
is to record it as owed and settle separately — waiving it would make e-transfer
the rational choice for every organizer and take card revenue with it.

---

## 2026-08-20 (later) — Embeddable schedule and standings

**Shipped.** An organizer wanted the schedule and standings on their own site.
They asked for an API; what they actually needed was a picture, so this is an
iframe embed rather than a data contract:

    /embed/l/<slug>/schedule
    /embed/l/<slug>/standings

**Why not a JSON API yet.** CLAUDE.md forbids API routes outside webhooks, and a
public response shape is a promise we can't take back once somebody builds
against it — that's an ADR, not a Tuesday. The embed also keeps improving on its
own: every fix we ship lands on their site, where a JSON consumer's page would
freeze at whatever they built. The owner chose embed now, ADR for the API later
if anyone actually wants the raw data.

Notes on the build:

- **Visibility is RLS's decision, not the route's.** The embed calls the same
  `getPublicLeague`, so a private or draft league 404s here exactly as it does
  on the public page. Verified signed-out: 200 for public leagues, 404 for
  anything else, no emails in the HTML, no navbar.
- **`noindex`.** Otherwise the embed competes with the real league page in
  search and drops players on a bare fragment with no way into the rest.
- **Auto-height.** An iframe can't size itself, so the embed measures itself and
  posts `{ type: "mysportsapp:height" }` to the parent. Hosts that want
  auto-sizing listen; hosts that don't are unaffected.
- A quiet footer links back to the full page — the host site usually can't,
  since it doesn't know the slug.

**Found and fixed a bug of my own while testing:** `getLadderNightStandings`
dated each night by slicing the UTC ISO string, so Tuesday 8pm in Toronto is
00:00Z Wednesday and every ladder night was labelled a day late ("Week 2 —
Wednesday, Aug 26"). Now converted in the league's timezone first.

---

## 2026-08-20 — A season total in the ladder standings

**Shipped.** The per-night tables answer "how did they do on Tuesday" but not
"how much have they played". Each row now carries a **Total** column beside GP.

It is a RUNNING total, accumulated week by week rather than computed across the
whole season. A season-wide figure would repeat the same number on every night's
table and would have week 1 claiming games that hadn't been played yet; the
running one grows as you read down. Week 2 currently shows `GP 0/4 · Total 6`
for V & the mandem — no games yet on Tuesday, carrying six from week 1 up with
them into Tier 1.

The figure rides on the row (`seasonGamesPlayed`, optional on
`StandingsRowView`) rather than in a parallel map, so a row can never be
rendered against someone else's total. The column appears only when at least one
row carries the field, which means every other standings table is untouched —
there, GP already IS the season total and a second copy of it would be noise.

---

## 2026-08-19 (later still) — Public schedules open on the next night

**Shipped.** The public schedule opened on "All days", so a player had to scroll
past nights that had already happened to find the one they cared about. It now
opens on the next night still to come — today included, because game day is
exactly when a schedule gets opened, and a night is still "next" while it's
being played. Once a season is over it falls back to the most recent night,
which is the one people look up results for.

`defaultScheduleDay` is pure and takes `today` as an argument rather than
reading the clock: "today" has to be resolved in the COMPETITION's timezone (a
Toronto league opened at 11pm from Vancouver is still on tonight), and computing
it during render would differ between the server pass and the client one. The
page resolves it; `ScheduleView` just takes an `initialDay`. 8 tests.

Organizer views are unchanged — "All days" is the right default when auditing a
season, and the prop defaults to null so nothing else moved.

**Also noticed, not fixed:** the schedule's By-tier grouping labels each game
with its team's CURRENT tier, not the tier it played in that night. On Mango's
Aug 18 all 6 Tier 1 games are labelled Tier 2 and 6 of the Tier 2 games are
labelled Tier 1. Same root cause as the standings bug fixed earlier today —
`teams.division_id` says where a team is now, and only `ladder_placements`
knows where it was. Fixing it means threading placements into the schedule
query, which is a bigger change than this one.

---

## 2026-08-19 (later still) — Ladder standings, per night

**Fixed.** The organizer's Standings tab showed V & the mandem on 0/10 with a
0-0 record — the same team that had just been promoted for going 5-1.

**Why.** Standings group by CURRENT tier, and `rankStandings` skips any match
where either side isn't in the group. In a normal tiered league nobody moves, so
that filter never fires. A ladder moves teams every week, so every promotion
retroactively erased the games that earned it. V & the mandem played 6 sets in
Tier 2, went up, and lost all six from their record because their opponents were
no longer in their tier. Every number on that screen traced to this: 2/8 for the
Tier 1 pair (only their 2 games against each other survived), 4/12 for the three
Tier 2 teams (their 2 games against the promoted side dropped), 0/10 for both
teams that moved.

A second, smaller fault sat underneath: played was filtered to same-tier games
while `gamesScheduled` counted every non-bracket match, so "2/8" compared two
different things and could never reach 8/8.

**The fix is a different artifact, not a better filter.** A cumulative table
cannot be fair in a ladder however it's computed — teams never share a schedule,
so ranking a season together either erases history or compares records built
against different tiers of opposition. The night is the unit that means
something: it's what they played, and it's exactly what decides who moves.

`getLadderNightStandings` returns one table per night, grouped by the tiers as
they stood THAT week — read from `ladder_placements`, not `teams.division_id`.
That distinction is the whole fix. Scheduled is counted over the same games that
are ranked, so the fraction compares like with like.

Ladder leagues get this on both the organizer and public Standings tabs; every
other competition is untouched (verified — Helix still shows its season table
with weekly columns).

Week 1 now reads correctly: Tier 1 SPIKERZ 4/4 (3-1), How I Set Your Mother 4/4
(3-1), Inappropriate Touches 4/4 (0-4); Tier 2 V & the mandem 6/6 (5-1),
Digamons 6/6 (5-1), Sauga Titans 6/6 (2-4), No Prob-Llamas 6/6 (0-6).

---

## 2026-08-19 (later) — Ladder: the draw finally reads the tier settings

**Fixed.** Mango's week 2 was drawn wrong in five ways. The organizer spotted it;
the diagnosis was that `drawLadderWeekAction` had never been wired to the
per-tier work.

What week 2 had, against what was configured:

| | drawn | configured |
|---|---|---|
| Tier 1 games | 9 (6 sets a team) | 6 (4 sets a team) |
| Tier 1 clock | 19:00, 15-min slots | 20:00, 20-min slots |
| Courts | 2 Tier 2 games on Court 1 | one court per tier, no crossover |
| Referees | none on any of 21 games | every game covered |
| Late start | nobody | top of Tier 2 sits out 4 slots |

**Root cause, in two parts.** `loadLadderContext` selected only
`id, name, tier_order` from divisions — it never read `ladder_target`,
`minutes_per_set`, `start_time`, `late_start_slots` or `courts` (migration
0073). And `lib/scheduler/ladder-night.ts` — `orderTierNight`,
`assignNightRefs`, `maxLateStartSlots`, all built and tested — **had no callers
anywhere outside its own tests**. Week 1 was right because it was written
directly by script using those functions; week 2 went through the app.

**The shape was wrong, not just the wiring.** `planLadderWeek` packs every tier
into a shared pool of courts on one league-wide clock. When each tier owns a
court and has its own start time and slot length — 3 teams on 20-minute sets
from 8pm beside 4 teams on 15-minute sets from 7pm — the tiers don't share a
wave at all, and forcing them onto one timeline is exactly what put a Tier 2
game on Tier 1's court. So `planTierNight` plans each tier's night end to end
on its own clock, and the action picks that path when every tier carries its
own settings. A ladder that never set them keeps the old packing.

19 tests, written against Mango's real configuration and asserting each of the
five faults directly.

**Week 2 redrawn** and verified: 18 games (was 21), Tier 1 six games on Court 1
at 20:00–21:40 on 20s, Tier 2 twelve on Court 2 at 19:00–21:45 on 15s, every
game refereed, no crossover, no double-bookings, and Inappropriate Touches — top
of Tier 2 — sitting out the first four slots while still refereeing the slot
before they play. Weeks 3–5 were not drawn, so nothing else needed redoing.

---

## 2026-08-19 — Player stats go public

**Shipped.** The stats table from yesterday was organizer-only in practice, and
players are the ones who care most about their own numbers. It is now on the
public league page, and a player's own record is on their profile.

**The privacy problem, and why RLS could not solve it.** Scores were always
public — a league page has to work for someone with no account. Player NAMES
were not: `users` is hidden except to people you share context with, correctly,
because that row carries an email address. A public stats table needs the name
and must never have the email, and **RLS cannot express that** — a policy grants
or denies a ROW, and granting the row hands over the email with it.

So the name is exposed through `competition_player_names` (migration `0078`), a
SECURITY DEFINER function returning the display name and nothing else. It
restates the `competitions_select` visibility rule rather than relying on it,
because SECURITY DEFINER bypasses RLS — getting that wrong would publish a
private competition's roster.

**One consequence, deliberately accepted:** the old code fell back to an
invitee's email when no name was recorded. On a public page that would publish
an address, so unclaimed spots now appear only if the organizer typed a name.
In Top Gun that hides 5 of 27 rows until those players claim or the organizer
fills the name in.

**Verified as a signed-out visitor** against the built app: the tab renders with
full data, and the HTML contains **zero email addresses** and **zero profile
links**. Names don't link publicly because `/players/[id]` reads the user row,
which RLS hides — a visitor clicking through would get a 404.

Also checked by impersonation: a signed-out visitor and a signed-in stranger
both get nothing from the function for a non-public competition, and neither can
read the `users` rows directly.

**On the profile:** a compact per-league card — sets, record, win rate, net
clutch — above payments, since players open their profile to see how they're
doing far more often than to check a receipt.

---

## 2026-08-18 — Player stats and profiles

**Shipped.** An organizer keeps a spreadsheet of per-player numbers — games
played, wins, points for/against, win %, points played, and a "clutch" block
counting sets won or lost by two points or fewer. They asked whether the app
could produce it. It can; all eleven columns come from data already stored.

**The formulas were reverse-engineered from their own sheet** rather than
guessed, because matching numbers they can check is what makes this
trustworthy. From one row: points played ÷ GP = 45.3 while average points for =
22.5, so "points played" counts BOTH directions and "average" counts only
theirs — conflating those two was the easiest way to get this wrong. Their
published 53.6% win, +8 net clutch and 26% clutch rate are asserted in the
tests.

**The real problem was never the arithmetic — it was attribution.** Scores are
per MATCH and a match belongs to TEAMS, so putting a number against a person
needs to know which sets that person was on court for. `lib/stats/player-stats.ts`
is therefore pure and takes a flat list of "what I scored, what was scored on
me"; deciding which sets those are lives separately in `lib/queries/player-stats.ts`.
That seam is what lets the 6s work add an attendance rule later without
touching any of the maths.

Today's rule is fixed-roster: everyone on a team is credited with every set the
team played. **Exactly right for 2s**, where a team IS its two players — Helix's
three beach leagues get real profiles with no new data at all. An approximation
for 6s, where people miss nights; that is what attendance will fix.

**Decisions taken with the owner:** attendance (when built) will assume the
roster played and let captains mark absences, rather than requiring a check-in;
and pairs ship first.

**Where it lives:** a Stats tab on the organizer's league page with the full
sortable table, and `/players/[playerId]` for one person's career plus a
per-competition breakdown. Career totals are recomputed from the combined set
list, not summed from the per-competition rows — averages and ratios don't add.

**Rosters are the practical limit.** The table draws on linked accounts plus
unclaimed invites, because a pair where one partner never claimed would
otherwise show as half a team. Unclaimed rows are badged and have no profile
behind them. In Top Gun, 6 of 27 player rows are still unclaimed.

Verified against Top Gun Summer 2026: 27 player rows, each pair's figures
matching the team-level numbers exactly. 17 unit tests on the engine.

---

## 2026-08-15 (later) — Individual sign-ups: free agents

**Shipped.** Most leagues take teams AND individuals — people with no team who
get placed. The app only modelled the first.

**The model decision.** A free agent is deliberately NOT a `teams` row. A team
is an ENTRANT: the schedule generator, standings, the payments dashboard and the
public team list all read `teams`. A person waiting to be placed is none of
those, so modelling them as a team would mean adding an exclusion to every one
of those readers — and the day one was missed, a free agent turns up in a
fixture. They get their own table; a `teams` row appears only when the organizer
actually forms a team.

**What a player answers** (migration `0076`): name, email, optional phone,
positions, level, and free-text notes. Positions come from
`sportConfig(sport).positions` — the five volleyball positions for indoor 6s and
co-ed 4s. Beach 2s and softball get NO position question: 2s roles are blocker
and defender, softball's are unconfirmed, and offering the wrong five would be
worse than asking nothing. Levels are Rec / Rec Intermediate / Intermediate /
Competitive, shared across sports.

**Money** (migration `0077`). The organizer sets a per-individual fee,
independent of the team fee. It is priced at the PER-PLAYER platform rate, not
the per-team one — a free agent is one payer settling one entry, and billing
them a team rate would charge one person as though they were a roster.
`registration_payments.team_id` became nullable with a `free_agent_id` beside it
and an XOR check, rather than inventing the placeholder team the whole design
avoids. Unpaid sign-ups sit at `pending_payment` and the webhook releases them.

**Placement.** `place_free_agents` writes the roster row and the status together,
and MOVES anyone already on another team rather than leaving them on two. The
organizer either forms a new team from a selection or tops up a short one.

**Verified against the live database**, impersonating real callers with
`set local role authenticated` — 20 checks, all passing: refused when the flag is
off, refused when registration is closed, trimming/lowercasing, re-signup edits
rather than duplicates, pending when a fee is set, an unrelated user sees
nothing, the player sees only their own row, the organizer sees the list, a
non-organizer cannot place anyone, and a move clears the old roster row.

**Also fixed, found while testing:** `getCompetitionVenues` returned every venue
in the ORG, so the softball registration page advertised 11 venues including
Brampton school gyms it has nothing to do with. It now returns only venues the
competition actually uses (matches, court list, divisions), and nothing at all
when none are assigned — the competition's own `venue` text already covers that.
Softball now shows 2, the BVL demo 6 instead of 11.

**Not done:** no refund path specific to individuals (a refunded sign-up doesn't
auto-withdraw — the organizer withdraws them, same as teams), and no live
test-mode payment has been run end to end.

---

## 2026-08-15 — Softball: the app stops assuming volleyball

**Shipped.** A prospective organizer asked whether we could run their softball
league. We can — and it cost far less than expected, because the scheduling
engine turned out to be entirely sport-agnostic already: nothing in
`lib/scheduler/` references `sport` at all. Round robins, divisions, pools,
venues, court assignment and referee rotation all work unchanged.

What WAS volleyball-specific was **scoring** and **vocabulary**.

**Scoring.** A softball game is one final score, so it stores as a single `sets`
row. Two new `match_format` flags carry the difference (jsonb — no DDL):

- `untargeted` — there is no target to reach, so no "below the target" warning
  and no win-by-two rule. A 15–0 game is just a 15–0 game.
- `allowTie` — a regular-season game may finish level; a playoff game may not,
  because it goes to extra innings. `validateScore` treats a drawn single game
  as a complete result when the format says so, and rejects it when it doesn't.

**A real bug this surfaced.** `computeStats` only counted a tie when both sides
had won a set — true of a drawn volleyball game, false of any sport whose match
IS a single period. A 6–6 softball game registered as nothing at all: not a win,
not a loss, not even a game played. The guard is now "a score was recorded"
rather than "someone won a set", which also makes a 0–0 tie count. Volleyball is
unaffected (a drawn game is 1–1, so both tests agree). Five tests added.

**Vocabulary.** `lib/sports.ts` is a small pure config layer — what a sport calls
its surface, its scored periods, its officials, and its points columns. It
replaced hard-coded "Court"/"Set"/"Ref"/"PF" strings across the schedule,
standings, score entry, print view, dashboard and weekly digest.
`formatCourtLabel(court, sport?)` is now the single entry point and defaults to
volleyball, so every existing caller is correct without passing anything. Adding
the sport after softball should be a config entry, not another sweep.

Standings needed no new columns: softball's `differential` tiebreaker and
single-set play already hid SW/SL and the set ratio. Only the labels moved —
PF/PA → RF/RA, "point differential" → "run differential".

**Migration `0075`** applied (the `sport` enum gained `softball`).

**Mocked in Test Org** so the organizer can see it: *Sunday Softball — Fall 2026*
at `/l/softball-mock-fall-2026`. Six teams, a full round robin over five
Sundays, then a playoff week. Three diamonds across two parks — East and West at
one, Oriole at the other — which exercises the venues model from `0071`. Three
weeks are played, including two ties. **The fixtures come from the real
`generatePairings`**, deliberately: that the untouched generator produces a
softball schedule is the claim being demonstrated.

**Assumed, not confirmed** — the organizer's own sheet was never supplied, so
team count, dates, times, park names and team names are all invented. The shape
is what matters; the specifics are a re-seed away.

**Not done:** per-inning scoring (only the final score is recorded), and
softball's own preset formats are in `lib/formats.ts` but no UI offers them yet.

---

## 2026-08-14 — Mango Sports ladder: per-tier nights and the staggered start

**Shipped.** An organizer asked for a 2-tier ladder where the tiers run on
genuinely different timetables, and one team arrives late as a reward for
finishing top. Every part of that broke an assumption in the ladder engine.

- **Migration `0073`** (applied). Per-tier overrides on `divisions`:
  `ladder_target`, `minutes_per_set`, `start_time`, `late_start_slots`. Null
  means "use the league's value", so every existing ladder is untouched.
  `divisions.courts` already existed for court pinning.
- **`lib/scheduler/ladder-night.ts`** — orders one tier's sets across its own
  night on a single court. `ladder-split.ts` decides who plays whom; this
  decides the running order, which is what players actually feel: no more than
  two sets back to back, no 45-minute waits, and **no back-to-back rematches**
  (the first attempt put the same pairing in slots 11 and 12).
- **The staggered start is expressed in SLOTS, not a clock time**, so "skip the
  first four sets" survives a change to set length.
- **The naive version of a late start is a trap**, and there's a test that says
  so: held back as long as arithmetically possible (8:30 here), the top team
  then has to play all six remaining slots **consecutively** — 90 minutes
  without a break, as the reward for winning. Arriving at 8:00 instead gives
  play-2, rest, play-2, rest, play-2.

**The league is live**: `/l/mango-ladder-fall-2026` — 7 teams, 2 tiers, 5
Tuesdays Aug 18 → Sep 15, week 1 drawn (18 sets).

| | Teams | Sets each | Set length | Window | Court |
|---|---|---|---|---|---|
| Tier 1 | 3 | 4 | 20 min | 8:00–10:00 | 1 |
| Tier 2 | 4 | 6 | 15 min | 7:00–10:00 | 2 |

Sets to 25 win by 2, 1 up / 1 down between tiers. Verified on the drawn night:
everyone gets their full share, nobody plays more than 2 in a row, longest wait
is 2 slots.

**Only week 1 is drawn, deliberately.** A ladder can't be pre-generated — who
plays whom in week 2 depends on where week 1 finishes — so the season carries a
calendar and each night is drawn once the previous one is scored.

**Tests:** 824 passing across 68 files. tsc, eslint and build clean.

**Not done:** `drawLadderWeekAction` still uses the league-wide values and packs
tiers into shared waves, so weeks 2–5 need the draw action taught to read the
per-tier columns. Week 1 was written directly. There's also no UI yet for
setting the per-tier fields.

---

## 2026-08-13 (later still) — Auto venue assignment

**Shipped.** Slice two taught the generator to respect a division's venue; this
chooses it. An **Auto-assign** button on the league page proposes which gym each
division plays in and fills the selects — it writes nothing, so the organizer
reviews a proposal in the same controls they'd use by hand.

- **`lib/scheduler/venue-assign.ts`** — 2-D packing: each venue is a
  `courts × slots` grid and each division a rectangle that must sit inside one
  grid. `courtsNeeded` is an INPUT, not `teams / 2` — BVL's D2 runs 8 teams
  across 2 courts, so half the division sits each round, and deriving it would
  bake in an assumption that's wrong for real data.
- **Fairness is the point, not packing.** Somebody always draws the late block —
  with more divisions than early slots that's arithmetic. What you control is
  *who*, round after round. `latenessFromHistory` reads the debt off the games
  already played, and the most-owed division picks first.
- **A bug worth recording:** weighting lateness only inside the cost function did
  nothing, because whoever is placed *first* takes the best slot regardless.
  Lateness had to lead the sort ORDER. The rotation test caught it.
- **A second, worse bug, found by running it on the real BVL shape.** Changeover
  smoothing was nudging blocks off alignment — a 3-round division starting at
  slot 1 of a 6-slot gym strands a 1-slot gap before and a 2-slot gap after,
  neither usable. Two divisions ended up unplaced while five gyms sat half
  empty. Fixed by restricting starts to *anchors*: the top of the night, or the
  moment the gym frees up. Both cases are now regression-tested.

**Measured on BVL's real Thursday** (9 divisions, 6 gyms) over 10 simulated
rounds: all 9 placed every round, 17% idle capacity, and the eight comparable
divisions land on an **identical mean start slot — a spread of 0.00**. Nobody is
shut out of an early block. (D2 is structurally pinned to slot 0: it needs all
seven slots at Terry Miller, so it has no choice.)

**Tests:** 809 passing across 67 files. tsc, eslint and build clean.

**Honest limit:** with 6-slot gyms and 3-round divisions every gym must flip at
slot 3, so the changeover smoothing has nothing to work with here — the worst
changeover stays at 48 teams. It only helps where block lengths differ. Making
the night's slot count itself a variable is what would fix that, and it isn't
in this slice.

---

## 2026-08-13 (later still) — Venues slice two: the generator learns about buildings

**Shipped.** Slice one made venues real so an existing schedule could be *read*
correctly. It taught the generator nothing: court assignment was still global
across a night, and the whole league shared one start time.

- **Migration `0072`** (applied, verified). `divisions.venue_id` — a division
  plays its night in one building, which is what lets courts be handed out per
  venue. Per-venue start times need no DDL: `weekly_slots` is jsonb, so a slot
  gains an optional `venueId` and the league carries one slot per venue. BVL's
  Thursday starts 6:00 at Jim Archdekin, 6:15 at St. Augustine, 6:30 at Terry
  Miller — one start time for the night cannot express that.
- **`planTieredLeagueSchedule` groups by venue as well as by instant.** Without
  it a six-gym night draws court numbers from one pool and puts two games on the
  same physical court. Passing no venues preserves the old behaviour exactly —
  all 431 existing scheduler tests were untouched.
- **Over-capacity is now reported, not silently absorbed.** Wrapping court
  numbers was always the fallback; doing it quietly is what made it dangerous.
  Four divisions assigned to a three-court gym produced a schedule that looked
  fine and double-booked a court all night.
- **`lib/scheduler/venue-conflicts.ts`** — a pure auditor over any schedule,
  generated or imported: court double-booked, team double-booked, venue over
  capacity, a team driving between gyms mid-night, a division split across
  buildings. 18 tests.
- **A Schedule check card** on the organizer page, shown even when clean —
  "no problems" is the reassurance you want before publishing, and a card that
  only appears when something is wrong is one nobody trusts is running.

**The auditor caught a bug in itself.** Run against the real BVL data it
reported five split divisions on Thursdays and three on Wednesdays. All false:
BVL *rotates* gyms week to week — Division C1 plays Jim Archdekin one week and
St. Marguerite the next — so comparing across a season flags every well-run
league in the system. Scoped to a single night, all three schedules come back
clean. That check is now pinned by a test built from the real pattern.

**Tests:** 784 passing across 66 files (up from 760/65). tsc, eslint and build
clean.

**Still not done:** the generator places a division at its venue but does not
*choose* venues — an organizer assigns them. Automatic assignment (balancing
divisions across gyms by size and court count) is a further slice, and probably
wants the changeover-load thinking from the beach analysis folded in.

---

## 2026-08-13 (later still) — Slice C finished: the two split-payment escapes

**Shipped.** An audit of Slice C against the plan found the five headline items
built, but two actions the plan explicitly promises were not. Both exist for the
same failure: a split fee stalls at "$45 of $60" because one teammate never
pays, and there is no way out.

- **"Cover the rest"** (captain / any team member). One payment for the
  outstanding balance, recorded as a `team_full` charge for the REMAINDER — not
  the whole fee. `teamPaymentState` sums `price_cents` across live rows, so the
  paid shares plus the remainder come to exactly the organizer's price. Four
  tests pin that invariant, including an uneven 5-way split where the remainder
  isn't a round share, and the case where refunding the covering payment
  correctly reopens the balance.
- **"Refund all N payers"** (organizer). Unwinds every refundable charge on a
  team with one reason typed once. Failures are collected rather than thrown —
  refunding three of four and reporting the fourth honestly beats aborting
  halfway with no record of which went through.

The amount is always recomputed server-side from the stored rows; a
client-supplied remainder could be forged, and the roster can change between the
page rendering and the click.

**Tests:** 760 passing across 65 files. tsc, eslint and build clean.

**Slice C is now complete.** What remains before payments can be relied on is
not code: no refund has been exercised against real Stripe money yet (unit tests
and rolled-back DB checks only), and go-live still needs live keys, real Connect
onboarding, and TOS / refund / surcharge disclosure copy.

---

## 2026-08-13 (later) — Venues: a competition can span several buildings

**Shipped.** Until now the model was one competition, one venue —
`competitions.venue` was a single text column and courts were a flat list of
labels. That holds for a beach league in one park. It does not hold for BVL's
indoor season, which runs **9 divisions across 6 school gyms on the same
night**, each gym with its own Court A/B/C.

- **Migration `0071`** (applied, verified). A `venues` table hanging off the
  **org**, not the competition — an organizer books the same gyms season after
  season, so the address and the "enter through the east doors by the garbage
  bins" note are typed once. Plus `matches.venue_id`, and `venueId` on each
  `LeagueCourt`.
- **Court labels collide across venues.** Every gym has a "Court A", so a label
  can no longer identify a court. That single fact drove the shape: the venue
  has to be stored on the match, not inferred, and `(venue, label)` is the only
  safe court identity.
- **A real bug this exposed:** the By-court schedule view keyed purely on the
  normalized label, so six gyms' "Court A" collapsed into one column and read as
  a six-way clash. Now keyed on venue + label.
- **`lib/venues/resolve.ts`** is pure and unit-tested (23 tests): court identity,
  placement formatting, grouping a schedule by building, and `isMultiVenue`.
- **The venue only shows when it earns its place.** `isMultiVenue` is measured
  against the *schedule*, not the venue list, so a single-site league still reads
  "Court 10" rather than "Woodbine Beach · Court 10" on every card.
- **UI:** a Venues card on the org page (address, entry directions, doors note,
  maps link) and a Court venues card on the league page that assigns each court
  to a gym — and stamps the venue onto games already scheduled there, so the
  court list and the schedule cannot drift.
- **Deleting a venue never deletes games.** The FK is `on delete set null`; the
  games keep their times and fall back to the competition's venue.

**Proven against real data.** Both BVL demos were converted off the
"venue baked into the court label" workaround: 151 + 83 games re-pointed, all
234 placed, and **Terry Miller came out as ONE org-level venue row shared by two
different leagues** — which is the entire argument for org-scoping.

**Tests:** 756 passing across 65 files (up from 733/64). tsc, eslint and build
clean.

**Deliberately NOT in this slice**, and worth stating because BVL's sheets use
both: per-venue start times (their Thursday night starts 6:00 at one gym, 6:15
at another, 6:30 at a third), and a venue-aware *generator* — nothing yet stops
the scheduler putting a team in two buildings back to back. Those need
`weekly_slots` and the scheduler itself to change, which is a second slice.

---

## 2026-08-13 — Payments Slice C: organizer payment management

**Shipped.** Slice B could take money. Slice C is what an organizer does about
it afterwards: chase it, forgive it, hand it back, or take a team without it.

- **Migration `0070`** (applied and verified). Refund state on
  `registration_payments` (`refunded_cents`, `stripe_refund_id`, `refunded_at`,
  `refund_reason`) with two check constraints — you can't refund more than was
  charged, and you can't refund a charge that never collected. Plus the
  admit-unpaid trail on `teams` and two SECURITY DEFINER functions.
- **Refunds** — pro rata, the way Stripe actually splits a destination charge.
  `reverse_transfer` + `refund_application_fee` mean the organizer and the
  platform each give back their own proportion; without them the refund would
  come entirely out of the platform's balance. `lib/payments/refunds.ts` is
  pure and derives the organizer's share by SUBTRACTION so the three parts
  always sum to the refund exactly — three independent `round()` calls can lose
  a cent, and a cent belonging to nobody is a reconciliation bug six months on.
- **The organizer writes nothing.** The refund action calls Stripe; the
  `charge.refunded` webhook records it, exactly as `checkout.session.completed`
  records a payment. `amount_refunded` is cumulative, so storing it directly is
  idempotent for free.
- **Partial-payment approval** — `admit_team_unpaid` promotes a
  `pending_payment` team to a real entrant. It deliberately does NOT clear the
  debt: the balance keeps showing on the dashboard, and who admitted them, when,
  and why is recorded. Letting a team play and forgiving what they owe are two
  decisions, not one.
- **Organizer-registered teams** — `organizer_register_team`, separate from
  `register_team` because the authorization is inverted (an admin creating a
  team for people who may not have accounts, rather than a caller registering
  themselves). The first listed email is invited as CAPTAIN, which is the case
  `teams.captain_user_id` was made nullable for. Capacity and payment gating
  still bind the organizer; the public gates (deadline, open/closed) don't.
- **Payments dashboard** — a Server Component on both organizer pages. Totals
  (collected, outstanding, tax, refunded) plus a per-team row sorted by who
  needs chasing, not alphabetically. `lib/payments/ledger.ts` does the rollup,
  pure and unit-tested.
- **Payment links** point at the TEAM PAGE, never at a Stripe URL — a Checkout
  session dies within 24 hours, which is useless in an inbox. The team page
  mints a fresh session on click.
- **Three transactional emails**: payment request, receipt, refund notice. No
  unsubscribe footers — money owed, taken and returned isn't marketing. The
  receipt exists because Stripe's own can't answer the question a captain has
  after paying a split fee: is the TEAM covered yet.
- **A refund now reopens a balance** everywhere, including partially:
  `teamPaymentState` nets each charge down pro rata. Refunds also surface on
  `/profile/payments` with the organizer's reason.
- Extracted the money formatter that had been copy-pasted into five payment
  components into `lib/payments/format.ts`.

**Verified against the live database** in rolled-back transactions — 21 checks:
both constraints refuse what they should, `admit_team_unpaid` refuses an
anonymous caller and is a no-op on an already-active team, and
`organizer_register_team` refuses a non-admin, makes the first listed existing
user the captain immediately, leaves someone without an account as a pending
invite, and still hits the capacity cap ("all 19 spots have been taken").

**Tests:** 729 passing across 64 files (up from 692/62). tsc, eslint, prettier
and `next build` all clean.

**Not done, and deliberately:** a refund does NOT demote a confirmed team back
to `pending_payment`. Mid-season that would silently pull them out of pools,
schedules and standings — destructive, and never what a goodwill refund means.
The balance reappears on the dashboard and the organizer decides.

**Next:** go-live — live Stripe keys, real (non-test) Connect onboarding, and
TOS / refund / surcharge disclosure copy.

---

## 2026-08-12 (later) — Payments Slice B: paid registration, end to end

**Shipped.** Money now moves. An organizer prices an event, a captain pays (or
splits it across the team), and the team isn't admitted to play until it's paid.

- **B1 — fee at the event** (`af61c7d`, migration `0063`): `platform_fee_settings`
  (singleton, 1% / $3 / $20) + `competition_payment_settings`. Organizers set a
  price from the league/tournament page; `RegistrationFeeCard` shows the
  pass-through math so nobody is surprised by the total.
- **B2 — Checkout** (`f9cddb2`, migration `0064`): destination charges with an
  application fee, the `registration_payments` ledger, and the
  `checkout.session.completed` webhook. Two **partial unique indexes** permit
  only one *open* charge per payer — that's what stops a double-clicked "Pay
  now" billing twice. Plan math is pure in `lib/payments/registration-plan.ts`.
- **B3 — split payments** (`6e59e41`): each player pays their own share; the
  team confirms when the shares complete. `ShareList` shows who's paid.
- **Wizard restructure + price at creation** (`7c39676`): pricing is a step in
  the tournament wizard, not an afterthought. Added a venue autocomplete.
- **Max teams** (`a97b453`, migration `0065`): a nullable cap; counting happens
  *inside* the SECURITY DEFINER function that inserts, so two captains racing
  for the last spot can't both get in.
- **Payment-gated registration** (`b34e59c`, migration `0066`): new
  `pending_payment` team status. The migration was the easy half — **8 team
  queries** now exclude pending teams from play (pools, schedules, brackets,
  standings). Organizer lists deliberately still show them; that's how you chase
  them.
- **Captain picks the payment mode at registration** (`4025db7`).
- **Player payments page** (`4a39961`, migration `0067`): `/profile/payments`.
  `payer_user_id` is stamped from `auth.uid()` inside the SECURITY DEFINER
  function — a parameter could be forged and the settling webhook has no user
  context.

**Also shipped the same day**, unrelated to payments:

- **Missing-score reminder** (`9477003`): a daily cron nudges captains when a
  league game has no score.
- **Organizer broadcasts** (`31a5a66`, migrations `0068` + `0069`): organizers
  message their players, with an `org_messages` audit log that stores a
  recipient *count*, never the address list. This also fixed a real bug —
  `unsubscribe(_token)` only ever set `notify_weekly`, so every opt-out link
  switched off the digest and kept sending whatever the reader objected to.
  Now it takes a `kind`. **Email footers must pass `?kind=`.**

**Tests:** 692 passing across 62 files. All migrations through `0069` verified
applied against the live database.

**Next:** Slice C — organizer payment management (partial-payment approval,
register-a-team + payment link, refunds, payments dashboard, receipts).

---

## 2026-08-12 — Payments Slice A: Stripe Connect Express onboarding

**Shipped.** Organizers can connect a Stripe account and the app tracks whether
they can be paid. No money moves yet.

- Added the `stripe` SDK (v22.5.0) — the first new dependency in a while, and
  unavoidable for any Connect call.
- `lib/payments/stripe.ts` — lazily built, memoised platform client, so a
  deployment without keys degrades to "payments not switched on" instead of
  crashing at boot.
- `lib/payments/account-sync.ts` — pure `Stripe.Account` → `payment_accounts`
  mapping (8 unit tests). Stores a *count* of outstanding requirements rather
  than the list, which names individuals.
- `startPayoutsOnboardingAction` — create-or-reuse the Express account, then an
  onboarding link; a **login link** once details are submitted, so the card's
  "Manage on Stripe" CTA isn't a dead end.
- `app/api/webhooks/stripe` — signature-verified `account.updated` handler; the
  only write path for capability flags.
- Migration **`0060`** applied to Supabase (it had been written weeks earlier and
  parked awaiting keys).

**Verified in production**, not just locally: a real Express account onboarded
through the deployed site, 10 `account.updated` events delivered, and the DB row
an exact match for Stripe's own account object.

**Two things cost real time**, both recorded in `HANDOFF.md`: Stripe treats a
3xx redirect on a webhook as a failed delivery (our apex domain redirects to
`www`), and connected-account events are invisible to `stripe.events.list()`
unless you pass the account context.

**Next:** Slice B — paid registration. Plan in
`docs/plans/registration-payments.md`.
