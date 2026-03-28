create extension if not exists pgcrypto;

create table if not exists public.bot_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  project_json jsonb not null,
  source_zip_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bot_projects_set_updated_at on public.bot_projects;
create trigger bot_projects_set_updated_at
before update on public.bot_projects
for each row
execute function public.set_updated_at();

alter table public.bot_projects enable row level security;

drop policy if exists "Users read own bot projects" on public.bot_projects;
create policy "Users read own bot projects"
on public.bot_projects
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users insert own bot projects" on public.bot_projects;
create policy "Users insert own bot projects"
on public.bot_projects
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users update own bot projects" on public.bot_projects;
create policy "Users update own bot projects"
on public.bot_projects
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users delete own bot projects" on public.bot_projects;
create policy "Users delete own bot projects"
on public.bot_projects
for delete
to authenticated
using (auth.uid() = user_id);