-- "You are in the pool for this league" — the dashboard had no way to say it.
--
-- 0131 fixed the drafted player who was already ON a team and could not see it.
-- This is the other half of that hole: somebody who has signed up, or been added
-- by their organizer, and is waiting to be drafted. They have no team, so
-- `my_competitions()` (which joins `team_members`) returns nothing for them, and
-- the dashboard told them to go and ask their organizer to add them to a team —
-- which their organizer had already done.
--
-- Big Shoots' Sean Gade is the live example: linked to his account, in the pool,
-- and shown nothing. It bites every drafted league between sign-up and draft
-- night.
--
-- WHY A FUNCTION rather than a query. The player can read their own
-- `free_agents` row (`free_agents_select` allows `user_id = auth.uid()`), but
-- they also need the competition's NAME — and `can_view_competition` admits a
-- platform admin, a PUBLIC competition, an org member, a competition admin, or
-- somebody with a `team_members` row. A pool member on no team in a private
-- league is none of those, so a plain join would return a nameless row. Same
-- reason `my_pending_invites` is security definer: it names competitions for
-- people who are not members yet.
--
-- 'placed' is excluded deliberately — since 0131 those people have a roster row
-- and appear under "Competitions you play in", and listing them twice would
-- read as two different things. 'withdrawn' is excluded because they pulled out.

create or replace function public.my_pool_signups()
returns table (
  competition_id uuid,
  slug text,
  name text,
  type competition_type,
  sport sport,
  status competition_status,
  org_name text,
  signup_status free_agent_status
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.slug, c.name, c.type, c.sport, c.status, o.name, f.status
    from free_agents f
    join competitions c on c.id = f.competition_id
    join organizations o on o.id = c.org_id
   where f.user_id = auth.uid()
     and f.status in ('available', 'pending_payment')
   order by c.start_date desc nulls last, c.name;
$$;
--> statement-breakpoint

comment on function public.my_pool_signups is
  'Competitions where the signed-in user is in the individual pool and not yet on a team. Excludes placed (they have a roster row) and withdrawn.';
--> statement-breakpoint

revoke all on function public.my_pool_signups() from public;
--> statement-breakpoint
grant execute on function public.my_pool_signups() to authenticated;
