-- Every name a roster member may be written down under.
--
-- The stats tab splits drafted players from subs by testing a lineup row's
-- identity against the roster. `competition_player_names` cannot answer that
-- question, because it returns ONE row per person on purpose: it feeds the
-- public team sheet, where listing somebody twice would be a bug. Its NOT
-- EXISTS drops the `free_agents` row as soon as a `team_members` row exists,
-- and with it the name the organizer DRAFTED them under.
--
-- Big Shoots, where this showed:
--
--     drafted as        account display_name     roster returned
--     Jack Sullivan     CeliacJack               CeliacJack
--     Jake Schuller     Schulaher                Schulaher
--     Mike Fleming      Mike                     Mike
--
-- The lineup says "Jake Schuller". The roster said "Schulaher". Same person,
-- no match, so a drafted player was filed under Subs. Six others were fixed by
-- keying the roster on name as well as account id (see `rosterKeys`); these
-- three survived it because the name the roster held was never the name anyone
-- types on a scoresheet.
--
-- So: a second function, for identity rather than display. It may return a
-- person more than once — that is the entire point — which is why it is not a
-- widening of the existing one.
--
-- Names only, never contact details: `free_agents` carries email, phone and
-- notes, and this is granted to signed-out visitors because the public stats
-- tab splits the same two tables the organizer's does.

create or replace function public.competition_roster_aliases(
  _competition_id uuid
)
returns table (user_id uuid, name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Mirrors `competitions_select`, exactly as `competition_player_names` does.
  -- SECURITY DEFINER bypasses RLS, so the visibility rule is restated here
  -- rather than relied upon — getting it wrong would publish a private roster.
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
    -- Accounts on a roster, under the name they registered with.
    select tm.user_id, u.display_name
      from team_members tm
      join teams t on t.id = tm.team_id
      join users u on u.id = tm.user_id
     where t.competition_id = _competition_id
       and coalesce(btrim(u.display_name), '') <> ''
    union
    -- Roster spots whose invite was never claimed.
    select null::uuid, ti.name
      from team_invites ti
      join teams t on t.id = ti.team_id
     where t.competition_id = _competition_id
       and ti.status = 'pending'
       and coalesce(btrim(ti.name), '') <> ''
    union
    -- Drafted onto a team, under the name the organizer drafted them as. NO
    -- NOT EXISTS here: when this differs from the account's display name, both
    -- are real identities for the same person and the lineup may use either.
    select fa.user_id, fa.name
      from free_agents fa
      join teams t on t.id = fa.placed_team_id
     where t.competition_id = _competition_id
       and fa.status <> 'withdrawn'
       and coalesce(btrim(fa.name), '') <> '';
end;
$$;
--> statement-breakpoint

revoke all on function public.competition_roster_aliases(uuid) from public;
--> statement-breakpoint

grant execute on function public.competition_roster_aliases(uuid) to anon, authenticated;
--> statement-breakpoint

comment on function public.competition_roster_aliases(uuid) is
  'Every (account, name) pair a roster member may be recorded under, for matching lineup rows to the roster. Returns a person more than once by design — use competition_player_names to DISPLAY a roster. Names never emails; readable by signed-out visitors.';
