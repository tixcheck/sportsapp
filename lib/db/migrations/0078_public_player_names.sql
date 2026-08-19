-- Player names for a public stats table.
--
-- The stats themselves were always public: scores, schedules and standings are
-- readable by anyone, because a league page has to work for someone with no
-- account. What was NOT public is who the players are — `users` is hidden by
-- RLS except to people you share context with, which is exactly right, because
-- that row carries an email address.
--
-- A public stats table needs the name and must never have the email. RLS can't
-- express that: a policy grants or denies a ROW, and granting the row would
-- hand over the email with it. So the name is exposed through a function that
-- selects the one safe column, rather than by loosening the table's policy.
--
-- What this deliberately does NOT expose:
--   * email addresses, of members or of invitees
--   * an invitee's email standing in for a missing name (the app used to fall
--     back to it; on a public page that would publish an address)
--   * anything at all for a competition the caller cannot already see

create or replace function public.competition_player_names(
  _competition_id uuid
)
returns table (team_id uuid, user_id uuid, name text, pending boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Mirrors the `competitions_select` policy. SECURITY DEFINER bypasses RLS,
  -- so the visibility rule has to be restated here rather than relied upon —
  -- getting this wrong would publish the roster of a private competition.
  if not exists (
    select 1 from competitions c
    where c.id = _competition_id
      and (
        c.visibility = 'public'
        or public.is_competition_admin(c.id)
        or public.is_org_member(c.org_id)
        or exists (
          select 1 from teams t
          join team_members tm on tm.team_id = t.id
          where t.competition_id = c.id and tm.user_id = auth.uid()
        )
      )
  ) then
    return;
  end if;

  return query
    -- Claimed accounts: the display name only. Every account has one, so there
    -- is no case where this needs to fall back to anything.
    select tm.team_id, tm.user_id, u.display_name, false
      from team_members tm
      join teams t on t.id = tm.team_id
      join users u on u.id = tm.user_id
     where t.competition_id = _competition_id
       and coalesce(btrim(u.display_name), '') <> ''
    union all
    -- Roster spots whose invite was never claimed. The organizer typed this
    -- name when they registered the team, and for a pairs league it is usually
    -- already half the team's name. A blank one is skipped rather than being
    -- replaced by the invitee's email.
    select ti.team_id, null::uuid, ti.name, true
      from team_invites ti
      join teams t on t.id = ti.team_id
     where t.competition_id = _competition_id
       and ti.status = 'pending'
       and coalesce(btrim(ti.name), '') <> '';
end;
$$;
--> statement-breakpoint

revoke all on function public.competition_player_names(uuid) from public;
--> statement-breakpoint

-- Readable by signed-out visitors too: a public league page is mostly read by
-- people with no account, and the function has already decided what is public.
grant execute on function public.competition_player_names(uuid) to anon, authenticated;
