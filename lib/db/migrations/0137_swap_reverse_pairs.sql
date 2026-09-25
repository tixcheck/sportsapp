-- Swap two pairs' places in a Reverse Pairs draw.
--
-- Veetun's problem: a pair is late, and the night cannot start without them.
-- The fix he asked for is to put a pair who is SITTING OUT into the late pair's
-- place, before the first whistle.
--
-- This is balance-preserving, and that is not a lucky accident. A Reverse Pairs
-- draw is balanced BY SLOT: whoever occupies position 5 plays 6 games, sits out
-- once, and meets a fixed spread of partners and opponents. Those properties
-- belong to the position, not to the people standing in it. Exchanging two
-- pairs' entire schedules is therefore a permutation of the draw, and every
-- guarantee survives it untouched — everyone still plays 6 and sits once.
--
-- THE WHOLE NIGHT, or nothing. Swapping only part of it would break exactly the
-- balance the format exists for, by giving a pair a partner spread computed for
-- a night that no longer happens. There is no "swap from round 3 onwards".
--
-- Refused once ANY score is in. After that a swap would hand one pair another
-- pair's results, which is a worse outcome than a late start.
--
-- Delete-then-reinsert rather than UPDATE, because `reverse_pairs_lineups` is
-- keyed `(game_id, team_id)`: across a full night the two pairs eventually meet
-- in the same game, and an UPDATE swapping both rows there collides on the
-- primary key mid-statement even though the final state is perfectly legal.

create or replace function public.swap_reverse_pairs(
  _competition_id uuid,
  _team_a uuid,
  _team_b uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _games integer;
  _played integer;
begin
  -- SECURITY DEFINER bypasses RLS, so the admin rule is restated here rather
  -- than relied upon. Without this, anyone could rewrite anyone's draw.
  if not public.is_competition_admin(_competition_id) then
    raise exception 'Only the organizer can change the draw.';
  end if;

  if _team_a = _team_b then
    raise exception 'Pick two different pairs.';
  end if;

  if (
    select count(*) from teams t
     where t.competition_id = _competition_id
       and t.status = 'active'
       and t.id in (_team_a, _team_b)
  ) <> 2 then
    raise exception 'Both pairs must be entered in this event.';
  end if;

  select count(*) into _played
    from reverse_pairs_games g
   where g.competition_id = _competition_id
     and g.score_a is not null;

  if _played > 0 then
    raise exception
      'Scores are already entered, so the draw is fixed. Swapping now would give one pair the other pair''s results.';
  end if;

  create temporary table _rp_swap on commit drop as
    select l.game_id, l.team_id, l.side
      from reverse_pairs_lineups l
      join reverse_pairs_games g on g.id = l.game_id
     where g.competition_id = _competition_id
       and l.team_id in (_team_a, _team_b);

  select count(distinct game_id) into _games from _rp_swap;

  delete from reverse_pairs_lineups l
   using _rp_swap s
   where l.game_id = s.game_id
     and l.team_id = s.team_id;

  insert into reverse_pairs_lineups (game_id, team_id, side)
  select s.game_id,
         case when s.team_id = _team_a then _team_b else _team_a end,
         s.side
    from _rp_swap s;

  drop table _rp_swap;

  return _games;
end;
$$;
--> statement-breakpoint

revoke all on function public.swap_reverse_pairs(uuid, uuid, uuid) from public;
--> statement-breakpoint

-- Signed-in only, and the function checks that they administer the event. No
-- anon grant: there is nothing here for a visitor to do.
grant execute on function public.swap_reverse_pairs(uuid, uuid, uuid) to authenticated;
--> statement-breakpoint

comment on function public.swap_reverse_pairs(uuid, uuid, uuid) is
  'Exchange two pairs'' entire Reverse Pairs schedules. Balance-preserving because the draw is balanced by slot, not by pair. Refuses once any score exists.';
