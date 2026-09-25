-- `my_pool_signups()` has to say whether the competition is public.
--
-- The dashboard's "Waiting to be placed" cards were not links, on the reasoning
-- that a drafted league is usually private and the public page would 404 for
-- exactly the people holding the card. That is true of Mango's Friday league —
-- and false of Big Shoots, which is public, where all twelve pool members pass
-- `can_view_competition` with no roster row at all. Generalising from one
-- league cost those players a page they could always have read.
--
-- So the card links when the event is public and stays plain text when it is
-- not, which needs `visibility` on the row. Returned from the FUNCTION rather
-- than inferred client-side: the database already knows, and deriving the same
-- permission twice is how a page and a server end up disagreeing — precisely
-- the bug that showed BVL's organizers a read-only schedule while the action
-- behind it would have accepted their scores.
--
-- Column ADDED to the end of the returns table, so the existing consumer keeps
-- working unchanged; a function's return signature cannot be altered in place,
-- hence the drop.

drop function if exists public.my_pool_signups();
--> statement-breakpoint

create or replace function public.my_pool_signups()
returns table (
  competition_id uuid,
  slug text,
  name text,
  type competition_type,
  sport sport,
  status competition_status,
  org_name text,
  signup_status free_agent_status,
  visibility competition_visibility
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.slug, c.name, c.type, c.sport, c.status, o.name, f.status,
         c.visibility
    from free_agents f
    join competitions c on c.id = f.competition_id
    join organizations o on o.id = c.org_id
   where f.user_id = auth.uid()
     and f.status in ('available', 'pending_payment')
   order by c.start_date desc nulls last, c.name;
$$;
--> statement-breakpoint

comment on function public.my_pool_signups is
  'Competitions where the signed-in user is in the individual pool and not yet on a team. Excludes placed (they have a roster row) and withdrawn. Returns visibility so the dashboard only links to a page the holder can actually read.';
--> statement-breakpoint

revoke all on function public.my_pool_signups() from public;
--> statement-breakpoint
grant execute on function public.my_pool_signups() to authenticated;
