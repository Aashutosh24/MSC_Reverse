-- ReverseIT Supabase bootstrap schema
-- Run this in Supabase SQL Editor for the project used by public/js/config.js and .env

-- 1) Profiles table (leaderboard source)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'User',
  upload_count integer not null default 0,
  score integer not null default 0,
  created_at timestamptz not null default now()
);

-- 2) Upload log table
create table if not exists public.uploads (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null,
  original_name text not null,
  size bigint not null,
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_uploads_user_id on public.uploads(user_id);
create index if not exists idx_uploads_uploaded_at on public.uploads(uploaded_at);

-- 3) Create profile row for each newly registered auth user
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'User')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user_profile();

-- 4) RPC used by upload API to increment leaderboard upload count
create or replace function public.increment_upload_count(uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (uid)
  on conflict (id) do nothing;

  update public.profiles
  set upload_count = upload_count + 1
  where id = uid;
end;
$$;

grant execute on function public.increment_upload_count(uuid) to anon, authenticated, service_role;

-- 5) Storage bucket for uploaded PDFs
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- 6) Optional: keep RLS enabled and permit read-only leaderboard access
alter table public.profiles enable row level security;
alter table public.uploads enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_public'
  ) then
    create policy profiles_select_public
      on public.profiles
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;
