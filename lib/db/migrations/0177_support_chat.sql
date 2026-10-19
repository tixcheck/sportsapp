-- In-app support chat (owner, 2026-10-19).
--
-- The help email shown after the player reviews had no inbox behind it, and a
-- new one costs money the app doesn't make yet. Instead a signed-in user opens
-- a Help window: an AI assistant answers first from a fixed list of app facts,
-- and hands the conversation to the platform admin when it can't help or the
-- user asks for a person. The admin replies from Admin → Support; an unread
-- badge (no emails) says when someone is waiting.
--
-- One open thread per user; once the admin closes it, the next message starts
-- a new one. Both tables are READ-ONLY over RLS — every write goes through the
-- functions below, so a user can't post as the admin, reopen someone else's
-- thread, or clear the admin's unread flag.

create table "support_threads" (
  "id" uuid primary key default gen_random_uuid() not null,
  "user_id" uuid not null references "users"("id") on delete cascade,
  -- ai: the assistant is answering · waiting: handed off, nobody has replied ·
  -- answered: the admin replied last · closed: done.
  "status" text not null default 'ai'
    check ("status" in ('ai', 'waiting', 'answered', 'closed')),
  "admin_unread" boolean not null default false,
  "user_unread" boolean not null default false,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
--> statement-breakpoint

create unique index "support_threads_one_open_per_user"
  on "support_threads" ("user_id") where "status" <> 'closed';
--> statement-breakpoint
create index "support_threads_inbox_idx" on "support_threads" ("updated_at" desc);
--> statement-breakpoint

create table "support_messages" (
  "id" uuid primary key default gen_random_uuid() not null,
  "thread_id" uuid not null references "support_threads"("id") on delete cascade,
  "author" text not null check ("author" in ('user', 'ai', 'admin')),
  "body" text not null check (length(btrim("body")) between 1 and 4000),
  "created_at" timestamptz not null default now()
);
--> statement-breakpoint
create index "support_messages_thread_idx" on "support_messages" ("thread_id", "created_at");
--> statement-breakpoint

alter table "support_threads" enable row level security;
--> statement-breakpoint
alter table "support_messages" enable row level security;
--> statement-breakpoint

create policy "support_threads_select" on "support_threads"
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
--> statement-breakpoint

create policy "support_messages_select" on "support_messages"
  for select to authenticated
  using (exists (
    select 1 from support_threads t
     where t.id = thread_id
       and (t.user_id = auth.uid() or public.is_platform_admin())
  ));
--> statement-breakpoint

-- The caller's open thread, created on first use.
create or replace function public.support_open_thread()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _id uuid;
begin
  if _uid is null then raise exception 'not signed in'; end if;
  select id into _id from support_threads where user_id = _uid and status <> 'closed';
  if _id is null then
    insert into support_threads (user_id) values (_uid) returning id into _id;
  end if;
  return _id;
end;
$$;
--> statement-breakpoint

-- A message from the user. Once a person is involved, it flags the admin.
create or replace function public.support_post_user_message(_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _id uuid := public.support_open_thread();
  _status text;
begin
  insert into support_messages (thread_id, author, body) values (_id, 'user', btrim(_body));
  select status into _status from support_threads where id = _id;
  update support_threads
     set updated_at = now(),
         -- The admin already answered: a follow-up goes back to them.
         status = case when _status = 'answered' then 'waiting' else _status end,
         admin_unread = (_status in ('waiting', 'answered'))
   where id = _id;
  return _id;
end;
$$;
--> statement-breakpoint

-- The assistant's reply, written by the server for the thread's owner. With
-- _hand_off it passes the thread to the admin.
create or replace function public.support_post_ai_reply(_thread uuid, _body text, _hand_off boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from support_threads where id = _thread and user_id = auth.uid() and status = 'ai') then
    raise exception 'not your open thread';
  end if;
  insert into support_messages (thread_id, author, body) values (_thread, 'ai', btrim(_body));
  update support_threads
     set updated_at = now(),
         status = case when _hand_off then 'waiting' else status end,
         admin_unread = _hand_off
   where id = _thread;
end;
$$;
--> statement-breakpoint

-- "Talk to a person": the user hands the thread over themselves.
create or replace function public.support_request_human()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _id uuid := public.support_open_thread();
begin
  update support_threads
     set status = 'waiting', admin_unread = true, updated_at = now()
   where id = _id and status = 'ai';
  return _id;
end;
$$;
--> statement-breakpoint

-- The admin's reply.
create or replace function public.support_post_admin_reply(_thread uuid, _body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  insert into support_messages (thread_id, author, body) values (_thread, 'admin', btrim(_body));
  update support_threads
     set status = 'answered', admin_unread = false, user_unread = true, updated_at = now()
   where id = _thread;
end;
$$;
--> statement-breakpoint

create or replace function public.support_close_thread(_thread uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  update support_threads set status = 'closed', admin_unread = false, updated_at = now()
   where id = _thread;
end;
$$;
--> statement-breakpoint

-- Opening a thread clears the reader's own unread flag.
create or replace function public.support_mark_read(_thread uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update support_threads set user_unread = false
   where id = _thread and user_id = auth.uid();
  if public.is_platform_admin() then
    update support_threads set admin_unread = false where id = _thread;
  end if;
end;
$$;
--> statement-breakpoint

grant execute on function public.support_open_thread() to authenticated;
--> statement-breakpoint
grant execute on function public.support_post_user_message(text) to authenticated;
--> statement-breakpoint
grant execute on function public.support_post_ai_reply(uuid, text, boolean) to authenticated;
--> statement-breakpoint
grant execute on function public.support_request_human() to authenticated;
--> statement-breakpoint
grant execute on function public.support_post_admin_reply(uuid, text) to authenticated;
--> statement-breakpoint
grant execute on function public.support_close_thread(uuid) to authenticated;
--> statement-breakpoint
grant execute on function public.support_mark_read(uuid) to authenticated;
