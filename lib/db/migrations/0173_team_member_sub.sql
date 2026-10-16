-- Subs on a team roster.
--
-- BVL, 2026-10-16: "All subs need to be part of the team/roster and have signed
-- waivers. But allow captains to mark them as subs." So a sub is an ordinary
-- team_members row with a flag. Everything that reads the roster (the waiver
-- gate, the minimum-roster count, schedules, messages) treats a sub like any
-- other member, which is what makes "subs sign the waiver" true without a
-- second rule. The flag is a label the captain and organizer set.
--
-- A column and not a third team_member_role: role decides who captains, and
-- more than forty places read it as captain-or-player. A sub is a player.
--
-- No policy change: team_members_manage already lets the team's captain and
-- the competition's organizers update their own team's rows.

alter table "team_members"
  add column if not exists "is_sub" boolean not null default false;
