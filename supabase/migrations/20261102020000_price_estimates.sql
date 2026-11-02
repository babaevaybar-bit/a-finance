-- Просчёты по прайсу PROFILDOORS (новый формат). Старая таблица estimates от прежнего «Просчёта» не трогается.
create table if not exists public.price_estimates (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  manager_id uuid references public.managers(id) on delete set null default public.my_manager_id(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  client_name text check (client_name is null or length(client_name) <= 200),
  client_phone text check (client_phone is null or length(client_phone) <= 50),
  title text check (title is null or length(title) <= 200),
  data jsonb not null default '{}'::jsonb,
  total numeric not null default 0,
  price_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists price_estimates_manager on public.price_estimates(manager_id, updated_at desc);

-- кто видит: свои просчёты — каждый; все — Главный админ, Директор, РОП, Технолог
create or replace function public.price_estimate_access(p_manager uuid, p_created_by uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_created_by = auth.uid()
      or (p_manager is not null and p_manager = my_manager_id())
      or exists (select 1 from profiles where id = auth.uid() and role in ('director', 'director_view', 'rop', 'technolog'));
$$;
revoke all on function public.price_estimate_access(uuid, uuid) from public, anon;
grant execute on function public.price_estimate_access(uuid, uuid) to authenticated;

alter table public.price_estimates enable row level security;
drop policy if exists price_estimates_select on public.price_estimates;
drop policy if exists price_estimates_insert on public.price_estimates;
drop policy if exists price_estimates_update on public.price_estimates;
drop policy if exists price_estimates_delete on public.price_estimates;
create policy price_estimates_select on public.price_estimates for select to authenticated using (price_estimate_access(manager_id, created_by));
create policy price_estimates_insert on public.price_estimates for insert to authenticated with check (created_by = auth.uid());
create policy price_estimates_update on public.price_estimates for update to authenticated using (price_estimate_access(manager_id, created_by)) with check (price_estimate_access(manager_id, created_by));
create policy price_estimates_delete on public.price_estimates for delete to authenticated using (price_estimate_access(manager_id, created_by));
