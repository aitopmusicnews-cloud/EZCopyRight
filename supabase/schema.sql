create extension if not exists pgcrypto;

create table if not exists public.works (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  artist text not null,
  co_artists text not null default '',
  genre text not null,
  description text not null default '',
  lyrics text not null default '',
  date_created date not null,
  date_registered timestamptz not null default timezone('utc', now()),
  registration_number text not null unique,
  digital_fingerprint text not null,
  file_hash text not null,
  file_name text not null,
  file_size bigint not null,
  file_type text not null,
  status text not null check (status in ('registered', 'pending')),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists works_user_id_idx on public.works(user_id);
create index if not exists works_date_registered_idx on public.works(date_registered desc);

alter table public.works enable row level security;

create policy "Users can read their own works"
on public.works
for select
using (auth.uid() = user_id);

create policy "Users can insert their own works"
on public.works
for insert
with check (auth.uid() = user_id);

create policy "Users can delete their own works"
on public.works
for delete
using (auth.uid() = user_id);
