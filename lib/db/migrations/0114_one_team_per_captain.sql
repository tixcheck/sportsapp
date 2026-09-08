-- One team per captain, per competition.
--
-- Nothing stopped the same person entering twice. In a capped league that is
-- two of eighteen spots and two fees owed, and the way it actually happens is
-- not fraud: a captain abandons registration at PayPal, comes back, and starts
-- again rather than finding the team they already made.
--
-- Scoped to a COMPETITION, like the team-name rule. Brampton runs four leagues
-- on four nights and the same person captaining a Tuesday team and a Thursday
-- team is ordinary — an organization-wide rule would refuse it.
--
-- Withdrawn teams are excluded, so an organizer withdrawing a team frees that
-- captain to enter again. That is the "unless the organiser has removed the
-- team" case, and it needs no separate mechanism.

create unique index if not exists "teams_one_per_captain_per_competition"
  on "teams" ("competition_id", "captain_user_id")
  where "status" <> 'withdrawn' and "captain_user_id" is not null;
