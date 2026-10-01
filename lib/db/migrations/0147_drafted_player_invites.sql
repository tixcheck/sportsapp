-- When a drafted player without an account was emailed to join, and at which
-- address.
--
-- Mango Sports, 2026-10-01: "Guys aren't seeing the email for mens." Adding a
-- drafted player's email only stored it — nobody was ever told. A player who
-- signs up with that address is linked to their team on first sign-in
-- (claim_free_agent_signups, 0130/0131), but nothing said to sign up.
--
-- The app now emails them (inviteDraftedPlayers). These two columns are what
-- keeps that to ONE email per address: `invited_email` is the address it went
-- to, so correcting a typo sends again to the new one, and saving the same
-- details twice does not. They also let the Players tab say "Invited Oct 1"
-- instead of "Not joined yet".

alter table "free_agents"
  add column if not exists "invited_at" timestamptz,
  add column if not exists "invited_email" text;
--> statement-breakpoint

comment on column "free_agents"."invited_at" is
  'When this drafted player (no account) was last emailed to join. Null = never.';
--> statement-breakpoint

comment on column "free_agents"."invited_email" is
  'The address that invite went to; a different current email means it has not been invited at that address yet.';
