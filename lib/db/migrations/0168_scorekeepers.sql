-- Scorekeepers: enter scores in one league, and nothing else.
--
-- Indru (BVL, 2026-10-13): "Is there only one level of admin access? Ie
-- granting onsites organizer access are they able to add/delete/view team or
-- member information etc?" They were: the only way to let an onsite enter
-- scores was a competition-admin grant, which is the whole league — teams,
-- rosters and contact details, schedule, payments. And a removed team wiped
-- BVL Non-Spiking's alignment night the night before (0167's commit).
--
-- A scorekeeper can see the league's schedule (even when it's gated to ready
-- teams, 0161) and enter or correct any game's score. Their entry is final,
-- like an organizer's, with no captain confirmation. Nothing else: they are
-- not competition admins, so every other policy already shuts them out.
--
-- Any league admin may add one (a scorekeeper is strictly less than they
-- are, so this can't escalate). Existing accounts only, by email — the same
-- rule as organizers.
--
-- Also closes a gap the scorer role would otherwise widen: `matches_score_
-- update` (0010) lets anyone who may score a game update ANY column of it —
-- so a captain could move their own game's time, court or opponent through
-- the API. A guard now lets a non-admin change only `status` (and never set
-- the organizer-only abnormal flag). It applies to direct client writes only
-- (`current_user = 'authenticated'`); security-definer functions such as
-- `place_bracket_winner` and `alignment_advance` run as their owner and are
-- unaffected.

create table if not exists "competition_scorekeepers" (
  "competition_id" uuid not null references "competitions"("id") on delete cascade,
  "user_id" uuid not null references "users"("id") on delete cascade,
  "granted_by_user_id" uuid references "users"("id") on delete set null,
  "created_at" timestamptz not null default now(),
  primary key ("competition_id", "user_id")
);
--> statement-breakpoint
create index if not exists "competition_scorekeepers_user_idx" on "competition_scorekeepers" ("user_id");
--> statement-breakpoint
alter table "competition_scorekeepers" enable row level security;
--> statement-breakpoint
drop policy if exists "competition_scorekeepers_select" on "competition_scorekeepers";
--> statement-breakpoint
create policy "competition_scorekeepers_select" on "competition_scorekeepers"
  for select to authenticated
  using (user_id = auth.uid() or public.is_competition_admin(competition_id));
--> statement-breakpoint
-- Writes go through the rpcs below only.

create or replace function public.is_competition_scorekeeper(_competition_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from competition_scorekeepers s
     where s.competition_id = _competition_id and s.user_id = auth.uid()
  );
$$;
--> statement-breakpoint
grant execute on function public.is_competition_scorekeeper(uuid) to authenticated;
--> statement-breakpoint

create or replace function public.grant_competition_scorekeeper(_competition_id uuid, _email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid;
begin
  if not public.is_competition_admin(_competition_id) then raise exception 'not authorized'; end if;
  select id into _uid from users where lower(email) = lower(trim(_email));
  if _uid is null then raise exception 'no account with that email'; end if;
  insert into competition_scorekeepers (competition_id, user_id, granted_by_user_id)
  values (_competition_id, _uid, auth.uid())
  on conflict (competition_id, user_id) do nothing;
  return _uid;
end;
$$;
--> statement-breakpoint
create or replace function public.revoke_competition_scorekeeper(_competition_id uuid, _user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_competition_admin(_competition_id) then raise exception 'not authorized'; end if;
  delete from competition_scorekeepers where competition_id = _competition_id and user_id = _user_id;
end;
$$;
--> statement-breakpoint
create or replace function public.list_competition_scorekeepers(_competition_id uuid)
returns table (user_id uuid, email text, display_name text)
language sql stable security definer set search_path = public as $$
  select u.id, u.email, u.display_name
    from competition_scorekeepers s
    join users u on u.id = s.user_id
   where s.competition_id = _competition_id
     and public.is_competition_admin(_competition_id)
   order by u.email;
$$;
--> statement-breakpoint
revoke all on function public.grant_competition_scorekeeper(uuid, text) from public;
--> statement-breakpoint
revoke all on function public.revoke_competition_scorekeeper(uuid, uuid) from public;
--> statement-breakpoint
revoke all on function public.list_competition_scorekeepers(uuid) from public;
--> statement-breakpoint
grant execute on function public.grant_competition_scorekeeper(uuid, text) to authenticated;
--> statement-breakpoint
grant execute on function public.revoke_competition_scorekeeper(uuid, uuid) to authenticated;
--> statement-breakpoint
grant execute on function public.list_competition_scorekeepers(uuid) to authenticated;
--> statement-breakpoint

-- Scoring: admins, scorekeepers, then captains/refs where the league allows.
create or replace function public.can_enter_score(_match_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches m
    join competitions c on c.id = m.competition_id
    where m.id = _match_id and (
      public.is_competition_admin(c.id)
      or public.is_competition_scorekeeper(c.id)
      or (c.allow_captain_entry and (
        public.is_match_captain(m.id) or public.is_match_team_member(m.id)
      ))
      or (c.allow_ref_entry and public.is_match_ref_member(m.id))
    )
  );
$$;
--> statement-breakpoint

-- Seeing the schedule (0161) — a scorekeeper must, gated or not.
create or replace function public.can_view_schedule(_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_competition_scorekeeper(_competition_id) or case
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

-- Non-admins may change a game's status, nothing else.
create or replace function public.matches_guard_scorer_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only direct client writes; definer functions run as their owner.
  if current_user <> 'authenticated' then
    return new;
  end if;
  if public.is_competition_admin(old.competition_id) then
    return new;
  end if;
  if (to_jsonb(new) - 'status' - 'is_abnormal') is distinct from (to_jsonb(old) - 'status' - 'is_abnormal') then
    raise exception 'Only an organizer can change a game''s time, court or teams.';
  end if;
  if new.is_abnormal and not old.is_abnormal then
    raise exception 'Only an organizer can record an abnormal result.';
  end if;
  return new;
end;
$$;
--> statement-breakpoint
drop trigger if exists "matches_guard_scorer_update" on "matches";
--> statement-breakpoint
create trigger "matches_guard_scorer_update"
  before update on "matches"
  for each row execute function public.matches_guard_scorer_update();
