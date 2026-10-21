-- Help questions that belong to a league go to the league's organizers.
--
-- The owner (2026-10-20): app questions are theirs to answer, but "when is my
-- game", "can I switch teams", "did my e-transfer arrive" are the league's.
-- Until now every handed-off conversation landed in the platform admin's
-- inbox and he relayed it by hand. Now the admin can pass a conversation to
-- an event; its organizers see it on the event's page and reply in the same
-- thread, which the player sees in their Help window like any other reply.
-- An organizer can pass it back if it turns out to be about the app.
--
-- A routed thread keeps its usual status (waiting / answered / closed); what
-- changes is who's waiting: `competition_id` set means the organizers, with
-- their own unread flag so the admin's badge doesn't count their work.

alter table "support_threads"
  add column if not exists "competition_id" uuid references "competitions"("id") on delete set null,
  add column if not exists "org_unread" boolean not null default false;
--> statement-breakpoint

create index if not exists "support_threads_competition_idx"
  on "support_threads" ("competition_id") where "competition_id" is not null;
--> statement-breakpoint

alter table "support_messages"
  add column if not exists "author_user_id" uuid references "users"("id") on delete set null;
--> statement-breakpoint

alter table "support_messages" drop constraint if exists "support_messages_author_check";
--> statement-breakpoint
alter table "support_messages" add constraint "support_messages_author_check"
  check ("author" in ('user', 'ai', 'admin', 'organizer'));
--> statement-breakpoint

-- Organizers read the conversations passed to their events, and nothing else.
drop policy if exists "support_threads_select" on "support_threads";
--> statement-breakpoint
create policy "support_threads_select" on "support_threads"
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_platform_admin()
    or (competition_id is not null and public.is_competition_admin(competition_id))
  );
--> statement-breakpoint

drop policy if exists "support_messages_select" on "support_messages";
--> statement-breakpoint
create policy "support_messages_select" on "support_messages"
  for select to authenticated
  using (exists (
    select 1 from support_threads t
     where t.id = thread_id
       and (
         t.user_id = auth.uid()
         or public.is_platform_admin()
         or (t.competition_id is not null and public.is_competition_admin(t.competition_id))
       )
  ));
--> statement-breakpoint

-- A follow-up from the player flags whoever has the conversation.
create or replace function public.support_post_user_message(_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _id uuid := public.support_open_thread();
  _status text;
  _comp uuid;
begin
  insert into support_messages (thread_id, author, body) values (_id, 'user', btrim(_body));
  select status, competition_id into _status, _comp from support_threads where id = _id;
  update support_threads
     set updated_at = now(),
         -- Someone already answered: a follow-up goes back to them.
         status = case when _status = 'answered' then 'waiting' else _status end,
         admin_unread = _comp is null and _status in ('waiting', 'answered'),
         org_unread = _comp is not null and _status in ('waiting', 'answered')
   where id = _id;
  return _id;
end;
$$;
--> statement-breakpoint

-- Platform admin: pass a conversation to an event's organizers, telling the
-- player in the thread who has it now.
create or replace function public.support_route_to_competition(_thread uuid, _competition uuid, _note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  if not exists (select 1 from competitions where id = _competition) then
    raise exception 'unknown event';
  end if;
  insert into support_messages (thread_id, author, author_user_id, body)
    values (_thread, 'admin', auth.uid(), btrim(_note));
  update support_threads
     set competition_id = _competition, status = 'waiting',
         admin_unread = false, org_unread = true, user_unread = true,
         updated_at = now()
   where id = _thread and status <> 'closed';
  if not found then raise exception 'conversation is closed'; end if;
end;
$$;
--> statement-breakpoint

-- An organizer's reply, on a conversation passed to one of their events.
create or replace function public.support_post_org_reply(_thread uuid, _body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  _comp uuid;
begin
  select competition_id into _comp from support_threads where id = _thread and status <> 'closed';
  if _comp is null or not public.is_competition_admin(_comp) then
    raise exception 'not authorized';
  end if;
  insert into support_messages (thread_id, author, author_user_id, body)
    values (_thread, 'organizer', auth.uid(), btrim(_body));
  update support_threads
     set status = 'answered', org_unread = false, user_unread = true, updated_at = now()
   where id = _thread;
end;
$$;
--> statement-breakpoint

-- An organizer hands a conversation back: it's about the app, not the event.
create or replace function public.support_return_to_platform(_thread uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  _comp uuid;
begin
  select competition_id into _comp from support_threads where id = _thread and status <> 'closed';
  if _comp is null or not public.is_competition_admin(_comp) then
    raise exception 'not authorized';
  end if;
  update support_threads
     set competition_id = null, status = 'waiting',
         admin_unread = true, org_unread = false, updated_at = now()
   where id = _thread;
end;
$$;
--> statement-breakpoint

create or replace function public.support_close_thread(_thread uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  _comp uuid;
begin
  select competition_id into _comp from support_threads where id = _thread;
  if not (public.is_platform_admin() or (_comp is not null and public.is_competition_admin(_comp))) then
    raise exception 'not authorized';
  end if;
  update support_threads
     set status = 'closed', admin_unread = false, org_unread = false, updated_at = now()
   where id = _thread;
end;
$$;
--> statement-breakpoint

create or replace function public.support_mark_read(_thread uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  _comp uuid;
begin
  update support_threads set user_unread = false
   where id = _thread and user_id = auth.uid();
  select competition_id into _comp from support_threads where id = _thread;
  if public.is_platform_admin() and _comp is null then
    update support_threads set admin_unread = false where id = _thread;
  end if;
  if _comp is not null and public.is_competition_admin(_comp) then
    update support_threads set org_unread = false where id = _thread;
  end if;
end;
$$;
--> statement-breakpoint

grant execute on function public.support_route_to_competition(uuid, uuid, text) to authenticated;
--> statement-breakpoint
grant execute on function public.support_post_org_reply(uuid, text) to authenticated;
--> statement-breakpoint
grant execute on function public.support_return_to_platform(uuid) to authenticated;
