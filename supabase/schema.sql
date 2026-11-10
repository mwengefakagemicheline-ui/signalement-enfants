create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  category text not null,
  neighborhood text not null,
  details text not null check (char_length(details) between 3 and 8000),
  contact text check (contact is null or char_length(contact) <= 200),
  status text not null default 'Nouveau' check (status in ('Nouveau', 'En évaluation', 'Accompagnement', 'Clôturé')),
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.reports enable row level security;

drop policy if exists "admins can read their own membership" on public.admin_users;
create policy "admins can read their own membership"
  on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "public can submit reports" on public.reports;
create policy "public can submit reports"
  on public.reports for insert to anon, authenticated
  with check (true);

drop policy if exists "admins can read reports" on public.reports;
create policy "admins can read reports"
  on public.reports for select to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = (select auth.uid())
    )
  );

drop policy if exists "admins can update report status" on public.reports;
create policy "admins can update report status"
  on public.reports for update to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = (select auth.uid())
    )
  );

revoke all on public.admin_users from anon, authenticated;
grant select (user_id) on public.admin_users to authenticated;

revoke all on public.reports from anon, authenticated;
grant insert (reference, category, neighborhood, details, contact) on public.reports to anon, authenticated;
grant select (id, reference, category, neighborhood, details, contact, status, created_at)
  on public.reports to authenticated;
grant update (status) on public.reports to authenticated;

-- A reference is a high-entropy bearer token. This function exposes only the
-- status needed for public tracking and keeps report details behind RLS.
create or replace function public.track_report(report_reference text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select reports.status
  from public.reports
  where reports.reference = report_reference
  limit 1
$$;

revoke all on function public.track_report(text) from public;
grant execute on function public.track_report(text) to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.reports;
exception
  when duplicate_object then null;
end
$$;
