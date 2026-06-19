 create or replace function public.place_bracket_winner(
    _match_id uuid,
    _winner_team_id uuid
  )
  returns void language plpgsql security definer set search_path = public as $$
  declare
    m record;
    parent_pos int;
  begin
    if not public.can_enter_score(_match_id) then
      raise exception 'not authorized to advance this match';
    end if;

    select competition_id, round, bracket_position, bracket_track,
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

    parent_pos := (m.bracket_position + 1) / 2;
    if (m.bracket_position % 2) = 1 then
      update matches set home_team_id = _winner_team_id
        where competition_id = m.competition_id
          and round = m.round + 1
          and bracket_position = parent_pos
          and bracket_track is not distinct from m.bracket_track;
    else
      update matches set away_team_id = _winner_team_id
        where competition_id = m.competition_id
          and round = m.round + 1
          and bracket_position = parent_pos
          and bracket_track is not distinct from m.bracket_track;
    end if;
  end;
  $$;