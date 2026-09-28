-- A league can hold more than one playoff: one per SESSION.
--
-- Big Shoots re-drafts its four teams every three Fridays, and the third night
-- of each block is that block's playoff — semis 1v4 and 2v3, then a final and
-- a 3rd-place game (Playoff Format 1, lib/scheduler/playoff-formats.ts). That
-- is eleven playoffs in a season, and the bracket model could hold one:
--
--   * a bracket slot is (track, round, position) within a competition and
--     division, so session 2's "round 2, position 1" IS session 1's final —
--     advancing a session-2 semi would write its winner into both finals;
--   * the 3rd-place game is found through max(round) over the same scope, which
--     would span every session.
--
-- `playoff_session` is the playoff night's date. Null for every bracket that
-- exists today and for every tournament and end-of-season league playoff, and
-- `is not distinct from` makes null match null — so all of them advance
-- exactly as before. Only session playoffs set it, and within one session the
-- tree behaves as a single bracket always has.
--
-- The function is 0123's unchanged except for that predicate on every walk
-- (the parent slot, the placement drop, final_round, the 3rd-place slot).

alter table matches
  add column if not exists playoff_session date;
--> statement-breakpoint

comment on column matches.playoff_session is
  'Session playoffs only: the night this playoff belongs to, so a league with a playoff every few weeks keeps each bracket separate. Null for every other match.';
--> statement-breakpoint

create or replace function public.place_bracket_winner(
  _match_id uuid,
  _winner_team_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record;
  parent_pos int;
  loser_id uuid;
  final_round int;
begin
  if not public.can_enter_score(_match_id) then
    raise exception 'not authorized to advance this match';
  end if;

  select competition_id, round, bracket_position, bracket_track, division_id,
         playoff_session,
         home_team_id, away_team_id, status
    into m from matches where id = _match_id;

  if not found or m.bracket_position is null or m.status <> 'completed' then
    return;
  end if;
  if _winner_team_id is null
     or (_winner_team_id is distinct from m.home_team_id
         and _winner_team_id is distinct from m.away_team_id) then
    raise exception 'winner must be one of the match teams';
  end if;

  -- A placement game has no round above it. It is the end of that team's
  -- playoff, so there is nothing to advance and nothing to work out.
  if m.bracket_track = 'placement' then
    return;
  end if;

  parent_pos := (m.bracket_position + 1) / 2;
  if (m.bracket_position % 2) = 1 then
    update matches set home_team_id = _winner_team_id
      where competition_id = m.competition_id
        and round = m.round + 1
        and bracket_position = parent_pos
        and bracket_track is not distinct from m.bracket_track
        and division_id is not distinct from m.division_id
        and playoff_session is not distinct from m.playoff_session;
  else
    update matches set away_team_id = _winner_team_id
      where competition_id = m.competition_id
        and round = m.round + 1
        and bracket_position = parent_pos
        and bracket_track is not distinct from m.bracket_track
        and division_id is not distinct from m.division_id
        and playoff_session is not distinct from m.playoff_session;
  end if;

  loser_id := case
    when _winner_team_id is not distinct from m.home_team_id
      then m.away_team_id
    else m.home_team_id
  end;

  -- First-round losers drop into the placement round, when one exists (0099).
  -- Mirrors the winner's route exactly: same parent position, same odd/even
  -- side. Updates nothing on a bracket that has no placement games.
  if m.round = 1 and loser_id is not null then
    if (m.bracket_position % 2) = 1 then
      update matches set home_team_id = loser_id
        where competition_id = m.competition_id
          and round = 1
          and bracket_position = parent_pos
          and bracket_track = 'placement'
          and division_id is not distinct from m.division_id
        and playoff_session is not distinct from m.playoff_session;
    else
      update matches set away_team_id = loser_id
        where competition_id = m.competition_id
          and round = 1
          and bracket_position = parent_pos
          and bracket_track = 'placement'
          and division_id is not distinct from m.division_id
        and playoff_session is not distinct from m.playoff_session;
    end if;
  end if;

  -- The 3rd-place game, when this track has one (migration 0094).
  --
  -- `final_round` is read from the data rather than computed from a team count,
  -- because byes leave the tree's shape as the only reliable statement of how
  -- many rounds there are. Placement games are excluded from that measurement —
  -- they are a parallel set of fixtures, not a deeper tree, and counting them
  -- would move the final. Scoped by division for the same reason: the sibling
  -- division's tree is not this tree.
  select max(round) into final_round
    from matches
    where competition_id = m.competition_id
      and bracket_position is not null
      and bracket_track is not distinct from m.bracket_track
      and division_id is not distinct from m.division_id
        and playoff_session is not distinct from m.playoff_session;

  if final_round is null or m.round <> final_round - 1 then
    return;
  end if;
  if m.bracket_position not in (1, 2) then
    return;
  end if;
  if loser_id is null then
    return;
  end if;

  if m.bracket_position = 1 then
    update matches set home_team_id = loser_id
      where competition_id = m.competition_id
        and round = final_round
        and bracket_position = 2
        and bracket_track is not distinct from m.bracket_track
        and division_id is not distinct from m.division_id
        and playoff_session is not distinct from m.playoff_session;
  else
    update matches set away_team_id = loser_id
      where competition_id = m.competition_id
        and round = final_round
        and bracket_position = 2
        and bracket_track is not distinct from m.bracket_track
        and division_id is not distinct from m.division_id
        and playoff_session is not distinct from m.playoff_session;
  end if;
end;
$$;
--> statement-breakpoint

comment on function public.place_bracket_winner(uuid, uuid) is
  'Advance a completed bracket match: winner into its parent slot, first-round loser into the placement round, semi-final loser into the 3rd-place game — all within the same division, track and playoff session.';
