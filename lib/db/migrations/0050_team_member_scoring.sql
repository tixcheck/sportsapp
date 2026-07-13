-- Open team-side score entry to any roster member, not just the captain.
-- `allow_captain_entry` now means "a playing team may self-report its score",
-- and any team_members row of a playing team qualifies — mirroring how ref
-- entry already works via is_match_ref_member. Captains keep access: they are
-- normally members too, and is_match_captain still covers any legacy captain
-- who has teams.captain_user_id set without a team_members row.

create or replace function public.is_match_team_member(_match_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches m
    join team_members tm on tm.team_id in (m.home_team_id, m.away_team_id)
    where m.id = _match_id and tm.user_id = auth.uid()
  );
$$;
--> statement-breakpoint

create or replace function public.can_enter_score(_match_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches m
    join competitions c on c.id = m.competition_id
    where m.id = _match_id and (
      public.is_competition_admin(c.id)
      or (c.allow_captain_entry and (
        public.is_match_captain(m.id) or public.is_match_team_member(m.id)
      ))
      or (c.allow_ref_entry and public.is_match_ref_member(m.id))
    )
  );
$$;
