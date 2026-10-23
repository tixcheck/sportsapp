-- 0187: Reverse Pairs numbers drawn at the door (BVL, 2026-10-23).
--
-- BVL's festival hands each pair a number (1–21) when they arrive, so who
-- plays where is random and the printed schedule only knows numbers. The pairs
-- are entered by name beforehand; the organizer types each pair's number as it
-- is drawn.
--
-- `draw_number` is the pair's PLACE IN THE SCHEDULE: number 7 is whichever
-- team currently holds slot 7's games. Every pair in such an event has one from
-- the start (arbitrary until confirmed); `draw_number_set` says the organizer
-- has entered it. Null on every other event.
alter table public.teams
  add column if not exists draw_number smallint,
  add column if not exists draw_number_set boolean not null default false;
--> statement-breakpoint

-- Deferrable so two pairs can trade numbers in one UPDATE.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'teams_draw_number_unique'
  ) then
    alter table public.teams
      add constraint teams_draw_number_unique
      unique (competition_id, draw_number) deferrable initially immediate;
  end if;
end $$;
--> statement-breakpoint

-- Give a pair the number it drew: it takes over that number's games, and the
-- pair holding them (not yet numbered) takes its old ones.
--
-- Unlike swap_reverse_pairs (0137) this is allowed after scores exist. Results
-- belong to the NUMBER: whoever played as 7 in round 1 was the pair that drew
-- 7, so moving slot 7's games, scores and all, to that pair is what makes the
-- standings right. Trading with a pair that already has its number would hand
-- over somebody's results, so that is refused.
create or replace function public.set_reverse_pair_number(
  _team_id uuid,
  _number integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _comp uuid;
  _mine smallint;
  _max integer;
  _holder uuid;
  _holder_set boolean;
  _holder_name text;
begin
  select t.competition_id, t.draw_number into _comp, _mine
    from teams t where t.id = _team_id;
  if _comp is null then
    raise exception 'Pair not found.';
  end if;
  -- SECURITY DEFINER bypasses RLS, so the admin rule is restated here.
  if not public.is_competition_admin(_comp) then
    raise exception 'Only the organizer can set numbers.';
  end if;
  if _mine is null then
    raise exception 'This event doesn''t use drawn numbers.';
  end if;

  if _number is null then
    update teams set draw_number_set = false where id = _team_id;
    return;
  end if;

  select max(t.draw_number) into _max
    from teams t where t.competition_id = _comp;
  if _number < 1 or _number > _max then
    raise exception 'Pick a number from 1 to %.', _max;
  end if;

  if _number = _mine then
    update teams set draw_number_set = true where id = _team_id;
    return;
  end if;

  select t.id, t.draw_number_set, t.name into _holder, _holder_set, _holder_name
    from teams t where t.competition_id = _comp and t.draw_number = _number;
  if _holder is null then
    raise exception 'Number % isn''t in this draw.', _number;
  end if;
  if _holder_set then
    raise exception 'Number % is already % — clear theirs first.', _number, _holder_name;
  end if;

  -- Delete-and-reinsert rather than UPDATE: the lineup key is
  -- (game_id, team_id), and two pairs in the same game would collide mid-swap.
  create temporary table _rp_num on commit drop as
    select l.game_id, l.team_id, l.side
      from reverse_pairs_lineups l
      join reverse_pairs_games g on g.id = l.game_id
     where g.competition_id = _comp
       and l.team_id in (_team_id, _holder);

  delete from reverse_pairs_lineups l
   using _rp_num s
   where l.game_id = s.game_id and l.team_id = s.team_id;

  insert into reverse_pairs_lineups (game_id, team_id, side)
  select s.game_id,
         case when s.team_id = _team_id then _holder else _team_id end,
         s.side
    from _rp_num s;

  drop table _rp_num;

  update teams
     set draw_number = case when id = _team_id then _number else _mine end,
         draw_number_set = case when id = _team_id then true else draw_number_set end
   where id in (_team_id, _holder);
end;
$$;
--> statement-breakpoint

revoke all on function public.set_reverse_pair_number(uuid, integer) from public;
--> statement-breakpoint
grant execute on function public.set_reverse_pair_number(uuid, integer) to authenticated;
