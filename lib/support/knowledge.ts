/**
 * The Help assistant's guide to the app: everything it may tell a player or an
 * organizer, with the exact labels they'll see on screen.
 *
 * Written 2026-10-19 from the code (every label was read from the JSX, not
 * remembered). The assistant answers ONLY from this, so:
 * - when a screen's wording changes, change it here too;
 * - things the app CAN'T do are listed on purpose, so it says "no" instead of
 *   inventing a menu;
 * - keep it plain text (it goes to the model, not to a browser);
 * - LEAGUE NOTES holds rules organizers confirmed in chats. Live league changes
 *   are made by scripts, which the docs hook can't see, so update that section
 *   by hand whenever a league's format, rounds or rules change.
 *
 * Last checked against the app: 2026-10-20 (both teams can default one set, 0184).
 *
 * It's long, which is fine: it's sent as a cached prompt prefix, so the cost
 * is paid once per few minutes, not on every message.
 */
export const KNOWLEDGE = `
=== ABOUT MYSPORTSAPP ===
MySportsApp (mysportsapp.ca) is the app volleyball organizers in the Toronto area use to run leagues and tournaments: Indoor 6s, Beach 2s and Co-ed 4s. Each organizer (for example Brampton Volleyball League, BVL, or Helix Volleyball) runs their own events; MySportsApp is the tool, not the league. The league organizer decides schedules, divisions/tiers, rules, fees and refunds. MySportsApp can help with how the app works and with account problems.
All times are shown in the event's venue timezone (Toronto), not the phone's timezone, in the app and in emails.

=== GETTING AROUND ===
Top bar (signed in): the logo goes to the dashboard. "My matches" (just an icon on small screens). The round avatar at the TOP RIGHT is the account menu. There is no bottom menu.
Account menu items, in order: My matches, Profile, Leave a review, Help & contact (opens this chat), Sign out.
Some players also see a "New organization" button in the top bar. It's for organizers; creating one needs organizer approval first (see ORGANIZERS).
On public event pages (league, tournament, Reverse Pairs, org pages), a signed-in visitor gets a slim bar with "Dashboard" and the same account menu.
Help: the "Help" button at the bottom right of every signed-in page, or account menu → Help & contact. When a person from the MySportsApp team replies, you get an email with their answer and an "Open Help" button, the dashboard shows "You have a reply from the MySportsApp team" with "Open Help", and the Help button shows a dot until you open it. To answer back, use Help; replies to the email aren't read. A question only the league can answer (your schedule, your team, a payment, a league rule) may be passed by the MySportsApp team to the league's organizers: the chat then says who has it, their replies show under the organizer's name (for example "Brampton Volleyball League"), and the email says "<organizer> replied". Keep replying in Help; it goes to them. Before signing in there is no chat: the sign-in page says to use "Forgot password?" or ask the league organizer.

Dashboard (/dashboard), sections appear only when they have something:
- "Pending invites": "You've been invited to join <team>…" with "Join team", or "You've been invited to captain…" with "Claim team".
- "Waiting to be placed" (individual sign-ups): "In the pool" or "Fee outstanding".
- "Before you play": a league's waiver to sign, or "<Org> needs a few details" with "Save my details".
- "Your next game" (or "You're reffing next"): opponent, day and time, gym and court. Buttons "Schedule & standings" and "Enter the score" ("Scoring opens on game day." before then).
- "Your teams", "Recent results", "Also coming up".
- "Competitions you play in": each card has the team, your role (captain/player), "Next: vs …", and buttons "My team", "Standings", and for captains "Invite teammate". "Join another league →" next to the heading opens the list of events you can sign up for.
- "Tournaments open for registration" with "Register →".
- For non-organizers: "Want to run leagues or tournaments?" with "Become an organizer".
- "Enjoying mysportsapp? Leave a review…" with "Review →".

=== ACCOUNT ===
Sign-in is email + password only. There is no Google/Apple sign-in and no sign-in-by-link.
Sign up (/signup): "Name", "Email", "Password" (at least 8 characters) → "Create account". Then confirm your email: the email says "Confirm your email" with a "Confirm and continue" button; the link lasts 24 hours. Outlook/Hotmail/Live often put it in junk or spam: check there. If you already had an account with that address, you get a "You already have an account" email with a "Sign in" button instead.
Sign in (/login): "Email", "Password", "Sign in". Link "Forgot password?".
Forgot password: sign-in page → "Forgot password?" → enter email → "Send reset link" → email "Reset your password" → "Choose a new password" → "New password" + "Confirm password" → "Update password". The link lasts 24 hours; if it expired, request a new one.
"Sign-in link is invalid or has expired": the link was old or already used. Request a new one (sign up again, or Forgot password?).
Change password while signed in: there's no separate screen; use "Forgot password?" on the sign-in page (sign out first).
Change email: account menu → Profile → "Email" card → "New email" → "Change email". Open the link sent to the NEW address ("Confirm your new address" → "Confirm this address"). If an email also arrives at the old address ("Approve your email change"), approve that too. Until then the old address keeps working.
Mistyped email / can't receive email at the current address: the user can't fix it alone. Hand off to a person, who can move the account.
Profile (/profile) cards: "Profile" (Display name, Avatar URL, "Save changes"; there's no phone field and no photo upload), "Email", "League details" (answers to an organizer's questions, editable, "Save my details"), "Your stats", "Payments" ("View your payments"), "Notifications".
Notifications (Profile → Notifications, then "Save preferences"): "Match results", "Schedule changes", "Weekly digest" (Sunday evening summary of your week's games), "Messages from organizers", and for organizers only "Organizer to-do list". Invites, confirmation emails and replies to your Help questions always send. Every email has an unsubscribe link at the bottom; it turns off that kind of email only, and can be turned back on in Profile → Notifications.
Deleting an account: not available in the app. Hand off to a person.
Two accounts / wrong account: an invite links to the account with the SAME email it was sent to. If someone made a second account with a different email, hand off.

=== FINDING AND JOINING AN EVENT ===
Browse: /find ("Find your league"), no account needed. Search by league name or venue. Finished seasons and private events don't appear; for those, ask the organizer or captain for the link. An organizer's page (/o/<name>) lists all their public events with "Register", "Join the waitlist" (when full), "Details" or "Schedule & standings".
A league's public page has tabs "Schedule", "Teams", "Standings", plus "Stats" and "Playoffs" when there are any. A tournament's has "Pools", "Schedule", "Playoffs", "Teams". When registration is open there's a "Register your team" card with "Go to registration".
Registering a team (/register/<event>): you need an account (the form offers "Create an account" or "I already have one" and brings you back). Depending on the event:
- Step by step: "Your team" (team name, division/tier preference, questions) → "Waiver" → "Payment" → "Teammates" ("Add your teammates", name + email, "Send invites", or "I'll do this later").
- Or a single form: team name, division, players, how you'll pay, then "Register team" or "Register & pay".
Signing up on your own (no team): if the event takes individuals, choose "Sign up on your own" → "Sign up on my own". You fill in name, email, positions, level, notes → "Sign me up" (or "Sign up — $X" if there's a fee). You go into a pool and the organizer puts you on a team; you'll then see the team on your dashboard. Status lines: "You're on the list.", "You've been placed on <team>.", "Your sign-up is waiting on the fee.". Players can't withdraw an individual sign-up themselves: contact the organizer.
Full or closed: "This event is full" or "Registration is closed". Only the organizer can add a team then. If the event has a waitlist: "Join the waitlist" (team name, email, tier). It's free to join; you see your place ("You're number N in the queue"). When a spot opens you get an email "A spot has opened…" with "Claim our spot"; claim it within the time the organizer set (often 48 hours), or it goes to the next team.
Private events can only be opened by the organizer and people on a team; others see "We couldn't find that page".
Reverse Pairs events (/rp/<event>): "Register your pair". Partner's name and email are optional: you're listed as "YourName/TBD" until a partner joins, then "YourName/Partner". Invite a partner later from your pair's page ("Invite partner"); a new invite replaces the old one, and once a partner has joined only the organizer can change them. A paid pair isn't in the draw until paid ("not paid yet, so not in the draw", "Finish paying →"). The game schedule is drawn after registration closes.
King of the Court: there's no public sign-up; the organizer adds pairs. The public page (/k/<event>) shows live scores.

=== TEAMS, INVITES AND WAIVERS ===
Team page (/teams/<team>): open it from the dashboard ("My team"). It shows the registration fee card, "Schedule", "Standing" and "Roster". Only team members and organizers can open it.
Roster shows each person as captain, player or Sub, with "Waiver ✓" or "Waiver not signed", and invited people as "Invited" or "Invite expired".
Captains (and organizers) can: invite with "Invite teammate" (enter "Player email" → "Send invite"; there's also "Copy claim link" to send it yourself), "Resend", "Edit" or "Cancel" an invite, "Make sub"/"Make regular", and "Remove" a player.
Captains can't: remove themselves, change who is captain, rename the team, or withdraw the team. Those are the organizer's. There's no "leave team" button for players: ask the captain or organizer to remove you.
Joining from an invite: the email says "Join your team" (or "Claim your team" for a captain). The link opens "Join your team" → "Accept the invite". Easier still: sign up or sign in with the SAME email the invite went to and open the dashboard. The invite is accepted automatically. If the invite went to a different or mistyped address, ask the captain to "Edit" the invite to the right email, or to send a new one. Invites expire after 30 days (14 for some league invites); the captain can resend.
"Join team" vs "Claim team": Claim team only appears when you were invited to captain the team.
Waivers: if a league needs one, it appears on your dashboard under "Before you play" (or during registration). Some ask for your full legal name and address first. Scroll to the end of the waiver text (or initial each section), type your full name, pick a signature style, then "I agree". Afterwards the roster shows "Waiver ✓" next to your name. One signature covers all of that organizer's leagues using the same waiver. Unsigned players get a reminder email at most once a week. There's no page to view a signed waiver afterwards; ask the organizer if you need a copy.
Hidden schedule: in some leagues (for example BVL) a team's schedule stays hidden until the roster has enough players AND everyone has signed the waiver. The team page and dashboard say what's missing ("N more players", "Waiting on the waiver", "N players haven't signed the waiver"). Once complete, the schedule appears by itself.
League details: organizers can ask questions (e.g. address, shirt size). You'll get "<Org> needs a few details" → "Add my details"; edit answers anytime at Profile → League details.

=== PAYMENTS (FOR PLAYERS) ===
The fee goes to the organizer. Paying by card goes through Stripe. Card and platform fees are added on top of the organizer's price and shown before you pay ("Card total, fees included"); the organizer receives their full price. E-transfer and PayPal amounts are exact, with no card or platform fee.
Ways to pay depend on the event:
- "I'll pay for the team": one payment, spot confirmed straight away.
- "Everyone pays their own share": split evenly; the team is confirmed once every share is in.
- E-transfer: you get an email "Send $X to confirm <team>…" with the organizer's address. The organizer confirms it by hand when it arrives, so the team stays unconfirmed until then.
- PayPal: pays the organizer's own PayPal. The organizer also confirms it by hand. You can add the PayPal transaction ID on the thank-you page to help them find it.
Team page "Registration fee" card: "Paid" / "Part paid" / "Unpaid", "Already paid", "Still owing". Buttons "Pay by card" (or "Pay the whole team fee"), "Pay my share", "Pay by PayPal". If teammates haven't paid their share, anyone can "Cover the rest — $X" (people who already paid keep their share paid).
If a card payment didn't go through, the team page says "Your payment didn't go through." Nothing was charged; press the pay button again. After paying: "Payment received — thank you." It can take a minute to show as paid.
"Card payment isn't available for this event": the organizer hasn't set up card payments; arrange another way with the organizer.
Receipts: after a card payment you get an email "Receipt: $X — <event>". When the organizer confirms an e-transfer/PayPal, you get "Payment received — <team> is confirmed".
Payment history: account menu → Profile → Payments → "View your payments". Lists what you paid (not teammates' payments), with "Paid", "Unfinished" (started, not finished), "Cancelled" (link expired, nothing charged) or "Refunded".
Unfinished checkout: a card checkout you don't finish expires after about a day, and nothing is charged. A team that registered but never paid may lose its spot then; register again or contact the organizer.
Refunds: only the organizer can refund; ask them. Card refunds go back to the same card, usually within 5–10 business days, and you get an email "Refunded $X — <event>". E-transfer, PayPal and cash refunds are sent by the organizer directly, outside the app. MySportsApp can't issue or promise a refund.
Tax: some organizers add tax (e.g. 13% HST); it's shown in the total.

=== GAMES, SCHEDULES AND SCORES ===
My matches (account menu → My matches) shows: "Up next" (your next game day), "Needs a score" (past games with no score yet), then "Schedule" (league), "Round robin" (tournament pools), "Playoff bracket", "Reffing", and "Recent results" (last 5). Finished games drop off; full results are in the event's Standings. Reverse Pairs and King of the Court games don't appear in My matches: see the event page.
Each game shows date, time, gym and court (e.g. "Tue, Oct 21 · 7:30 PM · Court A"). Times are estimates in some leagues ("Match order is set; times are estimates.").
Full schedule: dashboard → "Schedule & standings", or the league's public page → "Schedule". Views can include "By round", "By date", "By tier", "By team", "By court"; turn on "My team" to filter.
There's no "Add to calendar" or calendar export.
Emails about games: "Your matches this week" (Sunday evening, if Weekly digest is on), "Rescheduled · <event>" when the organizer moves a game, "Schedule moved · <event>" when the whole schedule is pushed back. Always check the schedule on the day.
Entering a score: who may enter scores is set by each organizer: any player on either team, the reffing team, or only the organizer. If you're allowed, open the game (My matches → "Enter score", or dashboard → "Enter the score") → for each set type both scores → "Record" → then "Submit score" (or "Submit for confirmation"). Scores open on game day only ("Scores open on game day"). A set that ends under the target (e.g. 22–18 in a set to 25) shows "Under 25: fine if time ran out, otherwise check the score." It's only a check: the set still records, and a set cut short by time is a valid result. Fix a typo by changing the number and tapping "Re-record". The app refuses a tied set, a set to 25 not won by enough (25–24), or a score past the league's cap.
Defaults (no-shows): organizers and scorekeepers see a "Default" button on each set of the score screen. Tap it → "Who defaulted this set?" → pick a team, or "Both teams". One team: the set fills in as the other team winning it to the target (25–0 in a set to 25) and shows "<team> defaulted". Both teams: the set is 0–0 and shows "Both teams defaulted"; nobody wins that set or gets points, and the other set decides the game. Then "Submit score" as usual. A late team can default set 1 and play set 2; both teams can be late for set 1, or run out of time for set 2. If both teams default every set, it counts as a double default. Tap "Default" → "Not a default" to undo, or just type a different score. When both teams miss the whole game, an organizer can also tap "Both teams defaulted the game" at the bottom of the game's page: each team gets a loss and 0 points, and the schedule shows "Both teams defaulted". "Undo double default" puts the game back to not played. Players and captains can't record a default.
Score rules the form checks: sets in order; no tied sets; win by 2 unless the cap is reached (e.g. capped 27–26 is fine); not past the cap; enough sets to decide the match. Some leagues play 2 sets, and 1–1 is allowed (a tie).
Confirmation: in leagues that require it, the other team sees "Confirm" / "Dispute". You can't confirm your own submission. "Dispute" marks the game "Disputed" and the organizer settles it. There's no email for this; check My matches.
Wrong score: once a score is final, players can't change it ("This score is final — ask the organizer to edit it."). Only the organizer can edit a final score. Tell the user to contact their organizer.
Missing score reminder: captains may get "Score needed: <game>" a day after an unscored game.
Timed games: if time runs out, enter the score as it stood. Whether a game must be played to a full score at time is the league's rule; ask the organizer.
Net setup and take-down: in leagues that use it, a game your team sets up for shows "Your team puts up the net on Court <x>. Arrive 10 min early.", and a game your team takes down after shows "Your team takes the net down on Court <x> after this game." They're on My matches, the team page and the dashboard, and in the weekly email. Only the first game on each court in a gym that night needs the net put up, and only the last game's net comes down; one of the two teams in that game is named, taking turns so every team does it and none does it more than others (a team that missed a turn goes first next round). It follows the schedule, so if games move it can change. The app works out who; to swap with another team, ask the organizer.

=== STANDINGS AND FORMATS ===
Standings columns: GP games played, MW matches won, T ties (if any), ML matches lost, SW/SL sets won/lost, PF/PA points for/against, Ratio (PF÷PA) or Diff (PF−PA). Tap a team's rank number for "Why is X ranked N?". A * marks a team that joined mid-season (scaled to the full schedule for ranking).
Default ranking order: matches won (a tie counts as half), then set ratio, then point ratio, then head-to-head among tied teams. Organizers can pick another order (head-to-head first, or point differential); the legend under the table says which.
League: a round robin; tiered leagues play a round robin per tier. Playoffs show in the "Playoffs" tab.
Tournament: pools (seeded by snake draft) play a round robin, then a single-elimination bracket ("The playoffs appear after pool play."). Pool winners are seeded first, then runners-up.
Ladder / tier nights: drawn one week (or round) at a time; after each, teams move up and down between tiers based on results. "Overall standings" are weighted by the tier each week was played in. The Standings tab shows one table per night, or per round in leagues that play rounds of several weeks (BVL's two-week rounds): a round's table adds up all its weeks, and a pairing that plays one game each week counts as one match. Tiers show where teams played that night or round, even if they've moved since.
BVL rounds: a round is two weeks; teams move tiers after both weeks.
Alignment night: groups of up to 6 teams play a round robin to set starting tiers; teams are ranked by wins, then head-to-head, then points.
Reverse Pairs: three pairs form a side of six against three other pairs; partners rotate; everyone plays the same number of games. Only the organizer enters scores. Standings are by point differential (every pair on a side gets that game's margin); W–L is shown but doesn't rank.
King of the Court (beach 2s): pairs rotate onto the King side; points only when the King side wins a rally; timed rounds; seeding rounds, then elimination. Only the organizer scores.

=== REVIEWS ===
Account menu → Leave a review (or the dashboard "Review →"). Pick 1–5 stars, write a comment, "Submit review". Reviews appear after approval ("Thanks! Your review will show once it's approved."). One review per person; editing it sends it for approval again.

=== ORGANIZERS ===
Becoming one: dashboard → "Become an organizer" → optional note → "Submit request". The MySportsApp team reviews it (no email is sent when it's approved: the dashboard changes to "Your organizations"). Then "New" (or "New organization") → "Organization name" → "Create organization". You're the owner.
Org page (/orgs/<org>): "Send a message", "Copy public link" (your /o/ page to share), sections "Leagues", "Tournaments", "King of the Court", "Reverse Pairs" with "New league", "New tournament", "New KotC", "New Reverse Pairs". Cards: "Waiver", "Home town", "Payments" (Stripe), "Logo", "Brand colours", "Venues" ("Add venue"), "Organizers".
Roles: owner/admin control everything. "Organizers" added on the org page (by email; they need an account first) run every event but can't create or delete events or change the org's logo, colours, venues or organizers. A league-only helper is added in the league's Settings → Admin → "Organizers"; scorekeepers ("Scorekeepers" card) can only enter scores, at their "Scorekeeper page". A scorekeeper reaches it from the dashboard's "Keeping score" card → "Enter scores →": that night's games by start time, each with "Enter score" (or "Edit" once scored). After "Submit score", or "← Back to all games", they return to the same spot in the list with the game they just left highlighted, so the next game is right there. Other nights are the date buttons at the top.
Player questions: when a player asks Help something only the league can answer, the MySportsApp team passes it to the league. Every organizer of that league gets an email "Player question: <league>" with an "Answer it" button, and the organization's main page (the one listing your leagues) has a "Player questions" box: it sits at the top, marked "1 waiting", while someone is waiting, and below your events otherwise. Open one → type in "Your reply" → "Send reply": the player gets it in Help and by email. "Mark as done" closes it; "Send back to MySportsApp" returns a question that's really about the app. Their follow-ups come back to the league.
Organizer to-do email: every Sunday evening, owners, admins, organizers and a league's own organizers get "Your organizer to-do list", one block per event, listing only what's waiting: disputed scores, games with no score (played at least 3 hours ago, up to 4 weeks back), ladder tiers with no finishing order entered, e-transfer/PayPal/cash payments to confirm you received, teams not in the standings yet (fee not paid, or players to join or sign the waiver), scores waiting for the other team to confirm, free agents to put on a team, waitlisted teams with no spot offered, and player questions waiting for a reply. Card payments aren't listed (they confirm themselves). Nothing waiting means no email that week. Turn it off in Profile → Notifications → "Organizer to-do list", or with the unsubscribe link at the bottom of the email.
Not possible in the app: transferring ownership, making someone an admin, removing an owner or admin. Hand off to a person for these.

Creating a league ("New league"): Sport → Details (name, season dates, venue, courts, rounds, games per week, minutes per game) → Schedule (match day, start time, blackout dates) → Format (match format, e.g. "Best of 3 to 25 (recreational)"; 2-set option) → Scoring (who enters scores, confirmation) → "Create league".
Creating a tournament ("New tournament"): Sport → Details → Divisions → Format ("Pools → Single bracket", "Pools → Championship + Consolation", "Custom") → Schedule (courts, games per team, max teams) → Match format and registration deadline → Payment → Scoring → "Create tournament".
Reverse Pairs: "New Reverse Pairs" → name, sport, date, start time, venue, courts (six pairs per court), points and minutes per game → "Create event". Tabs "Tonight", "Standings", "Setup", "Settings".
King of the Court: "New KotC" → pairs per pool, seeding rounds, rounds, minutes, optional point cap → "Create competition".
Ladder: an existing league with at least 2 tiers → Settings → Format → "Set up ladder" → "Turn on ladder format". A "Ladder" tab then has "Draw week 1", "Lock", "Undo last lock", and "Lock and draw automatically".
Net duty: league's Schedule tab → "Net setup" card → tick "Name a team to put up each net". Off until switched on. It names a team to put up each court's net before the first game and one to take it down after the last. Teams see it on their games, dashboard and weekly email, and a BVL round's printed schedule lists "Court A nets: up <team>, down <team>" per gym. There's no way to pick the team by hand.

Publishing: new events start private. League: "Publish" (public page live) / "Unpublish". Registration is separate: "Registration" → "Accept team registrations", optional close date, maximum teams (then a waitlist opens), waitlist claim window → "Copy sign-up link". Players can't reach the form until the league is published. Tournament: "Publish"/"Unpublish" plus "Open registration"/"Close registration". Reverse Pairs: "Publish"/"Take offline" and "Let pairs sign themselves up."
Running a league (league page tabs: Schedule, Ladder, Standings, Playoffs, Teams, Players, Stats, Settings):
- "Generate schedule" (needs 2+ teams). If games were played, choose "Redraw remaining weeks" (keeps results) or "Erase everything and start over".
- One game: its "Edit" button → "Reschedule match" (date & time, court). Both teams are emailed.
- Everyone: "Push schedule" (skip from a date, push 1–4 weeks, optional reason). Players are emailed.
- "Courts" re-spreads upcoming games over a new number of courts. "Add teams mid-season" for late teams.
- "Edit settings" for name, dates, match day, courts, format, tiebreaker order. The match format locks after the first score.
- Teams tab: "Tiers" (manage tiers), tier dropdown per team, "Edit name", "Make captain", "Remove" (only before any game is played), "Withdraw" (after play starts; keeps results).
- Playoffs tab: "Draw the playoff" / "Generate playoffs"; in the bracket "Enter score" / "Edit score".
- Organizers can edit or clear any score from the schedule ("Edit score"), record an abnormal result, and record defaults (see GAMES).
- Undo: Settings → Admin → "Restore points" → "Restore". Saved automatically before anything that deletes games or results.
- "Mark completed" after the last date: drops the event off players' dashboards. "Reopen" undoes it.
- Delete: Settings → Admin → Danger zone → "Delete league" / "Delete tournament" (type the name). It's blocked while players have card payments that aren't refunded: refund them first. Reverse Pairs and King of the Court events have no delete button; hand off to a person.
Players and sign-ups: "Add team" on the Teams tab (the captain is emailed); "Free agents" card to place individuals ("Create team" / "Add to team"); Players tab → "Ask N for missing details", "Invite N not joined".
Waivers: org page "Waiver" card → "Write your waiver" → "Save as draft" → "Approve" (approved wording locks; "Write a new version" to change it). Then in the event's Settings → Registration → "Waivers" choose it as "Waiver required" and "Save". Teams wait until everyone signs; reminders go out automatically, weekly at most.
Messaging players: "Send a message" is on the org page (and on each league's page). Tournament, Reverse Pairs and King of the Court pages don't have it: use the org page's and pick the event there. Pick events, optionally specific teams, "Everyone" or "Captains only", subject and message. "Send a test to me" first shows how many people it would reach. It reaches players on confirmed teams only. Unpaid teams, withdrawn teams and unplaced individuals aren't included, nor anyone who turned off organizer emails. Replies come straight to your email.
Payments setup: org page "Payments" card → "Connect Stripe" (Stripe's own sign-up). Card payments work once Stripe accepts charges; payouts arrive about 2 business days after each payment (the first payout can be held 7–14 days). The event's "Registration fee" card: "You receive, per team" (fees are added on top for the player), "One person pays for the team" and/or "Players pay their own share", "Registration requires payment", optional e-transfer email, optional PayPal link, optional tax → "Save registration fee".
Payments tab: "Collected", "Outstanding", "Tax collected", "Refunded"; each team row expands to its payments. "Send payment link" emails the team a link to pay. "Admit anyway" lets an unpaid team play. "Record payment" records cash/e-transfer/PayPal/other by hand. "e-transfer"/"PayPal"/"Offline payments" inbox: "Confirm received" or "Didn't pay". "Undo" un-confirms a hand-recorded payment.
Refunding: Payments tab → tap the team to expand it → "Refund" next to a card payment → choose "Refund all $X" or "Part of it", add an optional reason (it goes in the player's email). When a team has several card payers there's also "Refund all N payers". Your Stripe balance and the platform fee are both reduced in proportion. If the money has already been paid out and the Stripe balance can't cover it, the refund fails with "There isn't enough in the Stripe balance to cover this refund yet": refund by e-transfer instead, or try again later (the app team is alerted). Cash, e-transfer and PayPal have no refund button: send that money back yourself, then "Undo" the payment if needed. Cancelling an event: message the players, refund card payments, return other payments, then delete (or mark it completed).

=== LEAGUE NOTES (rules organizers have confirmed; update when a league changes) ===
Brampton Volleyball League (BVL), all nights:
- Game score at time: when time runs out, a one-point lead wins (25–24 is a valid final). A game can't end tied: if it's tied at the buzzer (25–25), play one more point (26–25). A match of 2 games can still split 1–1, which counts as a tie.
- Teams move tiers by results. Women's Wednesday and Reverse 4s Tuesday play 2-week rounds: everyone in a tier plays each other across the two weeks, then 2 teams move up and 2 down at each tier line. In 6-team tiers, some pairings play one game each week, and the two games together count as one match (2–0 a win, 1–1 a tie).
- Non-Spiking (Tuesday) plays 4-week rounds; Thursday Co-ed 6s is in alignment weeks, where teams climb between sessions at each gym.
- A team's schedule shows once its roster is full and every player has signed the waiver (see TEAMS).
- Net setup: every team helps put up the nets during a round, so it doesn't fall on the referee, and no team does it more than others. A team on net duty arrives 10 minutes before its first game. Teams also take turns taking the nets down after the last game. If your game shows "Your team puts up the net" or "Your team takes the net down", that's your turn (see GAMES). All four BVL leagues use it.
- Games end at least 5 minutes before the gym booking ends. At Notre Dame on Thursdays everyone has to be out of the gym by 8:00 pm.
- Scores in BVL leagues are entered by BVL's organizers, not by players or the reffing team. If a score looks wrong, tell BVL.
- Defaults (confirmed by BVL 2026-10-20): a team that defaults a set scores 0 and the other team 25 for that set. If both teams default one set (both late, or out of time), that set is 0–0 for nobody and the other set decides the game. If both teams default the whole game, it's a loss for both and 0 points for either. Every set needs a winner: a game can't end with a set left unscored or tied.
- How ties in the tier rankings are broken, playoff seeding, and which gym a tier plays at are BVL's decisions; for those, contact BVL.

=== WHAT THE APP DOESN'T DO (say so; don't invent a way) ===
No Google/Apple sign-in, no sign-in by email link, no change-password screen (use Forgot password), no account deletion button, no phone number on profiles, no photo upload (avatar is an image link), no calendar export, no push notifications or text messages, no chat between players, no player "leave team" or "withdraw" button, no player score edits after a score is final, no score-confirmation emails, no ownership transfer, no delete for Reverse Pairs or King of the Court events. MySportsApp can't refund, change a schedule, move a team between tiers, or change league rules: that's the organizer.

=== WHEN TO HAND OFF ===
Hand off when: the user can't sign in after trying Forgot password; the email is mistyped or two accounts need merging; they want their account deleted; a payment looks wrong (charged twice, charged but the team shows unpaid after an hour); a button or page shows an error or won't load; an invite or link doesn't work after the steps above; an organizer needs something the app can't do (ownership transfer, deleting a Reverse Pairs or KotC event); or they ask for a person.
Point to the organizer (and don't hand off unless they also need the app team) for: refunds, fees, schedules and game times, tiers or divisions, rules, adding a team to a full event, roster disputes, and fixing a final score.
`.trim();
