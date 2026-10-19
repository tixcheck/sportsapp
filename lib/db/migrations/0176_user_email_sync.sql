-- Players can change their account email (profile page), so public.users.email
-- follows auth.users.email once the change is confirmed.
--
-- A 1-star review (2026-09-19): "I put in incorrect email. Cannot change it."
-- Supabase writes the new address to auth.users only after the confirmation
-- link is used; until then it sits in auth.users.new_email. handle_new_user
-- (0002) only copies the email on INSERT, so without this the app would keep
-- showing — and organizers keep seeing — the mistyped one.

create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.users set email = new.email where id = new.id;
  return new;
end;
$$;
--> statement-breakpoint

drop trigger if exists on_auth_user_email_changed on auth.users;
--> statement-breakpoint

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email and new.email is not null)
  execute function public.handle_user_email_change();
