-- 0191: Security audit, batch 3 (2026-10-30).
--
-- 1. users: RLS lets teammates read each other's row (users_select →
--    shares_context_with), and RLS is per row, so that included `phone` and
--    `unsubscribe_token`. With the token a teammate could switch off someone's
--    emails through the public `unsubscribe` RPC. Column grants now leave both
--    out. Nothing in the app reads `phone`; the one reader of other people's
--    tokens (organizer messages) uses `unsubscribe_tokens` below, and the
--    crons use the secret key, which column grants don't touch.
--    NOTE for later migrations: a new users column is NOT readable through
--    the API until it is added to the grant below.
-- 2. users_insert_self let a signed-in user insert their own row with any
--    column, is_platform_admin included. handle_new_user creates every row at
--    sign-up and the app never inserts one, so the policy and the grant go.
-- 3. A TEAM registration question is readable by the whole roster (0104), so
--    it must not ask for an email, phone or home address.

revoke select, insert, delete, truncate, references, trigger
  on public.users from anon, authenticated;
--> statement-breakpoint
grant select (
  id, email, display_name, avatar_url, created_at,
  notify_results, notify_schedule_changes, notify_weekly,
  notify_org_messages, notify_admin_digest,
  organizer_status, is_platform_admin
) on public.users to anon, authenticated;
--> statement-breakpoint
drop policy if exists users_insert_self on public.users;
--> statement-breakpoint

-- Unsubscribe tokens for an organizer's message, only for people the caller
-- may message: themselves (the test send) and players in competitions they
-- run. Same people `users_select` already shows them, minus teammates.
create or replace function public.unsubscribe_tokens(_user_ids uuid[])
returns table (user_id uuid, token uuid)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.unsubscribe_token
    from users u
   where u.id = any(_user_ids)
     and (
       u.id = auth.uid()
       or public.is_platform_admin()
       or public.administers_team_member(u.id)
     );
$$;
--> statement-breakpoint
revoke all on function public.unsubscribe_tokens(uuid[]) from public, anon;
--> statement-breakpoint
grant execute on function public.unsubscribe_tokens(uuid[]) to authenticated, service_role;
--> statement-breakpoint

alter table public.registration_questions
  drop constraint if exists registration_questions_team_no_contact;
--> statement-breakpoint
alter table public.registration_questions
  add constraint registration_questions_team_no_contact
  check (scope <> 'team' or kind not in ('email', 'phone', 'address'));
