-- League organizers can message the players in the leagues they run.
--
-- BVL added Vince (Thursday) and Natalie (Non-Spiking) as league organizers
-- (`competition_admins`, 0029): one league each, not the whole org. Vince,
-- 2026-10-14: "Do I have email powers … Not showing for me." Messaging was
-- org members only (0169), so a convenor scoped to one league couldn't warn
-- his own teams. Mailing a league's players is no new power for its admin:
-- they already read its rosters and contact details.
--
-- The rule: every event a message goes to must be in this org AND one the
-- sender administers. One event outside that and the whole send is refused,
-- so a league organizer can never reach another league's players. The same
-- rule decides which past messages they can read: only ones that went
-- entirely to events they run.

create or replace function public.administers_all_competitions(_org_id uuid, _ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(cardinality(_ids), 0) > 0 and not exists (
    select 1 from unnest(_ids) as x(id)
     where not exists (
             select 1 from competitions c where c.id = x.id and c.org_id = _org_id
           )
        or not public.is_competition_admin(x.id)
  );
$$;
--> statement-breakpoint
revoke all on function public.administers_all_competitions(uuid, uuid[]) from public;
--> statement-breakpoint
grant execute on function public.administers_all_competitions(uuid, uuid[]) to authenticated;
--> statement-breakpoint
drop policy if exists "org_messages_select_admin" on "org_messages";
--> statement-breakpoint
create policy "org_messages_select_admin" on "org_messages"
  for select to authenticated
  using (
    public.is_org_member("org_id")
    or public.is_platform_admin()
    or public.administers_all_competitions("org_id", "competition_ids")
  );
--> statement-breakpoint
drop policy if exists "org_messages_insert_admin" on "org_messages";
--> statement-breakpoint
create policy "org_messages_insert_admin" on "org_messages"
  for insert to authenticated
  with check (
    sent_by = auth.uid()
    and (
      public.is_org_member("org_id")
      or public.administers_all_competitions("org_id", "competition_ids")
    )
  );
