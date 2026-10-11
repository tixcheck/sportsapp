-- The dashboard honours the schedule gate (0161).
--
-- Indru (BVL), 2026-10-10, with a captain's screenshot — Fubu, 3 of 4 joined:
-- "Should it show them their game time? Or that they can't see the schedule
-- until they confirm their 4 player? It doesn't look obvious what they need to
-- do." The dashboard card read "Next: vs Big Dig Energy · Round 1 · Court b":
-- `my_competitions` is SECURITY DEFINER, so it read the games the 0161 policy
-- withholds. Owner's call: nothing until the roster is complete.
--
-- So for a team in a gated league that isn't ready, the next-game columns are
-- null, and the row says why instead: `schedule_locked` plus the team's
-- numbers (joined / minimum / unsigned waivers / invites out) for a checklist.
-- Organizers and org members are never locked. Every other row is unchanged.

drop function if exists public.my_competitions();
--> statement-breakpoint

create function public.my_competitions()
returns table (
  competition_id uuid, slug text, name text, type competition_type, sport sport,
  status competition_status, team_id uuid, team_name text,
  member_role team_member_role, team_status team_status,
  next_match_id uuid, next_scheduled_at timestamptz, next_round integer,
  next_court text, next_home_name text, next_away_name text,
  has_matches boolean, last_match_at timestamptz,
  schedule_locked boolean, roster_joined integer, roster_min integer,
  roster_unsigned integer, roster_invited integer
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select c.*, t.id as tid, t.name as tname, t.status as tstatus, tm.role as trole,
           (
             c.schedule_ready_teams_only
             and public.team_entry_blocked(t.id) is not null
             and not public.is_competition_admin(c.id)
             and not public.is_org_member(c.org_id)
           ) as locked
      from team_members tm
      join teams t on t.id = tm.team_id
      join competitions c on c.id = t.competition_id
     where tm.user_id = auth.uid()
  )
  select
    c.id, c.slug, c.name, c.type, c.sport, c.status,
    c.tid, c.tname, c.trole, c.tstatus,
    nm.id, nm.scheduled_at, nm.round, nm.court, hn.name, an.name,
    exists (
      select 1 from matches m
      where m.home_team_id = c.tid or m.away_team_id = c.tid
    ) as has_matches,
    (
      -- The team's most recent scheduled match, played or not. Null when the
      -- schedule carries no times at all, which the caller reads as "no idea
      -- how long ago" and keeps the competition visible.
      select max(m.scheduled_at) from matches m
      where m.home_team_id = c.tid or m.away_team_id = c.tid
    ) as last_match_at,
    c.locked,
    (select count(*)::int from team_members m where m.team_id = c.tid),
    c.min_roster_for_entry,
    case when c.waiver_id is null then 0 else
      (select count(*)::int from team_members m
        where m.team_id = c.tid
          and not exists (
            select 1 from waiver_acceptances a
             where a.waiver_id = c.waiver_id and a.user_id = m.user_id
          ))
    end,
    (select count(*)::int from team_invites i where i.team_id = c.tid and i.status = 'pending')
  from mine c
  left join lateral (
    select m.*
    from matches m
    where not c.locked
      and (m.home_team_id = c.tid or m.away_team_id = c.tid)
      and m.status not in ('completed', 'cancelled')
    order by m.scheduled_at asc nulls last,
             m.round asc nulls last,
             m.court asc nulls last
    limit 1
  ) nm on true
  left join teams hn on hn.id = nm.home_team_id
  left join teams an on an.id = nm.away_team_id
  order by c.start_date desc nulls last, c.name;
$$;
--> statement-breakpoint
grant execute on function public.my_competitions() to authenticated;
