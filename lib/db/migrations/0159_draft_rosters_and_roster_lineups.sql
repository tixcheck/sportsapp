-- Two fixes for a league that re-drafts its teams every session (Mango Friday
-- Mens, 2026-10-07).
--
-- 1. THE DRAFT BOARD SAVED, THE ROSTERS DIDN'T FOLLOW. Roger re-drafted on
--    Oct 2 and "the new teams don't show up": the board (free_agents) was
--    right, but five players still had roster rows (team_members) on their old
--    team. `place_free_agents` only removes the row on the team the BOARD last
--    had them on; rows made any other way — a Teams-tab invite, an account
--    link — were never touched. Quinton, Bryan and Ionut ended up on two teams.
--
--    `sync_draft_rosters` makes the board the truth for everyone it knows: a
--    player whose pool row is placed on team X is on team X's roster and no
--    other in this league; a player returned to the pool is on none. Captains
--    are never removed as a side effect (same rule as place_free_agents).
--    It also reports, for a league that drafts every session, anyone on a
--    roster who is NOT on the board at all (Harsh M, Fabio Di Roma: their pool
--    rows were typed in without an email, so they never linked) — the save
--    can't move a person it can't see, so it says so instead.
--
-- 2. STATS FOLLOWED THE CURRENT ROSTER. Without lineups, a player is credited
--    with every set their CURRENT team ever played — so after a re-draft,
--    Bryan carried Team 1's Sep 25 games (he played for Team 2). Big Shoots
--    avoids this by entering lineups; Mango doesn't want to.
--
--    `competitions.appearances_from_roster`: when a game is completed, each
--    side's lineup is recorded from that team's roster AT THAT MOMENT (minus
--    anyone marked absent), unless a lineup was already entered. Stats then
--    read lineups (`track_appearances`), so a game stays credited to the
--    people who were on the team that night, whatever later drafts do.

alter table "competitions"
  add column if not exists "appearances_from_roster" boolean not null default false;
--> statement-breakpoint
comment on column "competitions"."appearances_from_roster" is
  'When a match completes, record each side''s lineup from its roster at that moment (0159). For drafted leagues that don''t enter lineups.';
--> statement-breakpoint

create or replace function public.sync_draft_rosters(_competition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _removed integer := 0;
  _off jsonb := '[]'::jsonb;
  _sessions integer;
begin
  if not public.is_competition_admin(_competition_id) then
    raise exception 'Only an organizer can sync rosters.';
  end if;

  with gone as (
    delete from team_members tm
     using teams t, free_agents fa
     where t.id = tm.team_id
       and t.competition_id = _competition_id
       and fa.competition_id = _competition_id
       and fa.user_id = tm.user_id
       and tm.role <> 'captain'
       and (fa.status <> 'placed' or fa.placed_team_id is distinct from tm.team_id)
    returning tm.user_id
  )
  select count(*) into _removed from gone;

  -- Drafted placed players with an account but no roster row on their team.
  insert into team_members (team_id, user_id, role)
  select fa.placed_team_id, fa.user_id, 'player'
    from free_agents fa
   where fa.competition_id = _competition_id
     and fa.status = 'placed'
     and fa.user_id is not null
     and fa.placed_team_id is not null
  on conflict (team_id, user_id) do nothing;

  -- Only a league that re-drafts treats "not on the board" as a problem; in a
  -- team-registered league most players were never in the pool, by design.
  select session_nights into _sessions
    from league_settings where competition_id = _competition_id;
  if coalesce(_sessions, 0) >= 2 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'team', t.name,
             'name', coalesce(nullif(btrim(u.display_name), ''), 'A player'))
             order by t.name, u.display_name), '[]'::jsonb)
      into _off
      from team_members tm
      join teams t on t.id = tm.team_id
      left join users u on u.id = tm.user_id
     where t.competition_id = _competition_id
       and tm.role <> 'captain'
       and not exists (
         select 1 from free_agents fa
          where fa.competition_id = _competition_id and fa.user_id = tm.user_id
       );
  end if;

  return jsonb_build_object('removed', _removed, 'offBoard', _off);
end;
$$;
--> statement-breakpoint
revoke all on function public.sync_draft_rosters(uuid) from public;
--> statement-breakpoint
grant execute on function public.sync_draft_rosters(uuid) to authenticated;
--> statement-breakpoint

-- The lineup a team fielded, taken from its roster now. Accounts from
-- team_members (named as the board names them, else the account name), plus
-- drafted players with no account yet (by their board name). Skips anyone
-- marked absent for this match, and a side that already has a lineup.
create or replace function public.fill_roster_appearances(_match_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _m record;
  _team uuid;
  _n integer := 0;
  _added integer;
begin
  select id, competition_id, home_team_id, away_team_id
    into _m from matches where id = _match_id;
  if not found then return 0; end if;

  foreach _team in array array[_m.home_team_id, _m.away_team_id] loop
    continue when _team is null;
    continue when exists (
      select 1 from match_appearances a
       where a.match_id = _match_id and a.team_id = _team
    );

    insert into match_appearances (competition_id, match_id, team_id, user_id, player_name, role)
    select _m.competition_id, _match_id, _team, tm.user_id,
           coalesce(nullif(btrim(fa.name), ''), nullif(btrim(u.display_name), ''), 'Player'),
           'rostered'
      from team_members tm
      left join users u on u.id = tm.user_id
      left join free_agents fa
        on fa.competition_id = _m.competition_id and fa.user_id = tm.user_id
     where tm.team_id = _team
       and not exists (
         select 1 from match_absences ab
          where ab.match_id = _match_id and ab.team_id = _team and ab.user_id = tm.user_id
       )
    on conflict do nothing;
    get diagnostics _added = row_count;
    _n := _n + _added;

    insert into match_appearances (competition_id, match_id, team_id, user_id, player_name, role)
    select _m.competition_id, _match_id, _team, null, btrim(fa.name), 'rostered'
      from free_agents fa
     where fa.competition_id = _m.competition_id
       and fa.status = 'placed'
       and fa.placed_team_id = _team
       and fa.user_id is null
       and length(btrim(coalesce(fa.name, ''))) > 0
       and not exists (
         select 1 from match_absences ab
          where ab.match_id = _match_id and ab.team_id = _team
            and ab.user_id is null
            and lower(btrim(ab.player_name)) = lower(btrim(fa.name))
       )
    on conflict do nothing;
    get diagnostics _added = row_count;
    _n := _n + _added;
  end loop;

  return _n;
end;
$$;
--> statement-breakpoint
revoke all on function public.fill_roster_appearances(uuid) from public;
--> statement-breakpoint

create or replace function public.matches_fill_roster_appearances()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed')
     and exists (
       select 1 from competitions c
        where c.id = new.competition_id and c.appearances_from_roster
     ) then
    perform public.fill_roster_appearances(new.id);
  end if;
  return null;
end;
$$;
--> statement-breakpoint
drop trigger if exists "matches_fill_roster_appearances" on "matches";
--> statement-breakpoint
create trigger "matches_fill_roster_appearances"
  after insert or update of "status" on "matches"
  for each row execute function public.matches_fill_roster_appearances();
