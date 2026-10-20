-- Who on a team has signed its league's waiver, for the team's own members.
--
-- waiver_acceptances is readable only by the signer and the league's admins
-- (0100), so a captain's roster read only their own row and showed every
-- teammate as unsigned (BVL Women's, ACE 23, 2026-10-20: the captain saw
-- "not signed" for players the organizers saw as signed). This returns just
-- the user ids that have signed, never the signature itself, to anyone on the
-- team, its captain, or an admin of its league.
create or replace function public.team_waiver_signed(_team_id uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct wa.user_id
    from teams t
    join competitions c on c.id = t.competition_id
    join team_members tm on tm.team_id = t.id
    join waiver_acceptances wa
      on wa.user_id = tm.user_id and wa.waiver_id = c.waiver_id
   where t.id = _team_id
     and c.waiver_id is not null
     and (
       t.captain_user_id = auth.uid()
       or exists (select 1 from team_members me where me.team_id = t.id and me.user_id = auth.uid())
       or public.is_competition_admin(t.competition_id)
     );
$$;
--> statement-breakpoint
revoke all on function public.team_waiver_signed(uuid) from public;
--> statement-breakpoint
grant execute on function public.team_waiver_signed(uuid) to authenticated;
