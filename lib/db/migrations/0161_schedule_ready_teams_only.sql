-- The schedule is shown only to teams that are ready to play.
--
-- Owner, 2026-10-10, for BVL: "The schedule should only be visible to teams and
-- captains with full roster and signed waiver." Decided with the owner: a
-- per-league switch (on for every BVL league); a READY team's signed-in
-- members see the whole league schedule; the public and players on teams that
-- aren't ready see a "finish your roster" checklist instead.
--
-- READY is the entry gate the app already has: `team_entry_blocked(team)` is
-- null — the league's minimum roster joined, every member has signed the
-- league's waiver (0148). Nothing new is defined here about what "ready" means.
--
-- Enforced in the database, not just hidden on the page: with the switch on,
-- `matches`, `sets` and `ladder_tier_nights` are unreadable to anyone the
-- schedule isn't for. Organizers, org members and platform admins always see
-- it. Off (the default), every policy reads exactly as before.

alter table "competitions"
  add column if not exists "schedule_ready_teams_only" boolean not null default false;
--> statement-breakpoint
comment on column "competitions"."schedule_ready_teams_only" is
  'Only organizers and members of ready teams (team_entry_blocked is null) can read the schedule (0161).';
--> statement-breakpoint

create or replace function public.can_view_schedule(_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1 from competitions c
       where c.id = _competition_id and c.schedule_ready_teams_only
    ) then public.can_view_competition(_competition_id)
    else
      public.is_platform_admin()
      or public.is_competition_admin(_competition_id)
      or exists (
        select 1 from competitions c
         where c.id = _competition_id and public.is_org_member(c.org_id)
      )
      or exists (
        select 1 from teams t
          join team_members tm on tm.team_id = t.id
         where t.competition_id = _competition_id
           and tm.user_id = auth.uid()
           and public.team_entry_blocked(t.id) is null
      )
  end;
$$;
--> statement-breakpoint
grant execute on function public.can_view_schedule(uuid) to anon, authenticated;
--> statement-breakpoint

-- A captain could always see their own games (private leagues). With the
-- switch on, a captain of a team that isn't ready is exactly who it's for.
drop policy if exists "matches_select" on "matches";
--> statement-breakpoint
create policy "matches_select" on "matches"
  for select using (
    public.can_view_schedule(competition_id)
    or (
      public.is_match_captain(id)
      and not exists (
        select 1 from competitions c
         where c.id = competition_id and c.schedule_ready_teams_only
      )
    )
  );
--> statement-breakpoint

-- Scores follow their games.
create or replace function public.can_view_match(_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from matches m
    where m.id = _match_id and public.can_view_schedule(m.competition_id)
  );
$$;
--> statement-breakpoint

-- Which gym and times each tier has each week is schedule too.
drop policy if exists "ladder_tier_nights_read" on "ladder_tier_nights";
--> statement-breakpoint
create policy "ladder_tier_nights_read" on "ladder_tier_nights"
  for select using (public.can_view_schedule(competition_id));
--> statement-breakpoint

-- What the signed-in player's own teams still need, for the checklist shown in
-- place of the schedule. Their own rows only.
create or replace function public.my_schedule_gate(_competition_id uuid)
returns table (
  team_id uuid,
  team_name text,
  joined integer,
  min_roster integer,
  unsigned integer,
  invited integer,
  blocked text
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name,
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
         public.team_entry_blocked(t.id)
    from teams t
    join competitions c on c.id = t.competition_id
   where t.competition_id = _competition_id
     and exists (
       select 1 from team_members m
        where m.team_id = t.id and m.user_id = auth.uid()
     );
$$;
--> statement-breakpoint
revoke all on function public.my_schedule_gate(uuid) from public;
--> statement-breakpoint
grant execute on function public.my_schedule_gate(uuid) to authenticated;
