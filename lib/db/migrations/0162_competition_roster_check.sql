-- Every team's roster readiness in one read, for the organizer's printed
-- schedule (BVL, 2026-10-10: "print schedule like how we sent mock with notes
-- and colors"; the mock led with a roster check).
--
-- Same rule as the entry gate (`team_entry_blocked`, 0148) and the schedule
-- gate (0161) — joined vs the league minimum, every member signed the
-- league's waiver — plus what the organizer acts on: invites not yet
-- accepted, and whether the team has paid. Organizers only: it counts other
-- people's waivers.

create or replace function public.competition_roster_check(_competition_id uuid)
returns table (
  team_id uuid,
  joined integer,
  min_roster integer,
  unsigned integer,
  invited integer,
  paid boolean,
  blocked text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_competition_admin(_competition_id) then
    raise exception 'Only an organizer can see roster readiness.';
  end if;
  return query
    select t.id,
           (select count(*)::int from team_members m where m.team_id = t.id),
           c.min_roster_for_entry,
           case when c.waiver_id is null then 0 else
             (select count(*)::int from team_members m
               where m.team_id = t.id
                 and not exists (
                   select 1 from waiver_acceptances a
                    where a.waiver_id = c.waiver_id and a.user_id = m.user_id
                 ))
           end,
           (select count(*)::int from team_invites i
             where i.team_id = t.id and i.status = 'pending'),
           exists (
             select 1 from registration_payments p
              where p.team_id = t.id and p.status = 'paid' and p.livemode
           ),
           public.team_entry_blocked(t.id)
      from teams t
      join competitions c on c.id = t.competition_id
     where t.competition_id = _competition_id;
end;
$$;
--> statement-breakpoint
revoke all on function public.competition_roster_check(uuid) from public;
--> statement-breakpoint
grant execute on function public.competition_roster_check(uuid) to authenticated;
