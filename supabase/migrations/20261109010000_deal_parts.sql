-- Части заказа: одна сделка в CRM, в Trello — несколько карточек (договор 26-53 → части 26-53/1, /2, /3, /4).
-- Привязывают в карточке клиента; этап производства и сверка суммы идут по всем частям.
create table if not exists public.deal_parts (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  part_no int not null check (part_no between 1 and 50),
  trello_card_id text not null unique,
  card_name text,
  amount numeric,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (deal_id, part_no)
);
create index if not exists deal_parts_deal on public.deal_parts(deal_id);

alter table public.deal_parts enable row level security;
drop policy if exists deal_parts_select on public.deal_parts;
drop policy if exists deal_parts_insert on public.deal_parts;
drop policy if exists deal_parts_update on public.deal_parts;
drop policy if exists deal_parts_delete on public.deal_parts;
-- видят и правят те, кому видна сама сделка (права «Продаж» действуют через RLS сделок)
create policy deal_parts_select on public.deal_parts for select to authenticated using (exists (select 1 from public.deals d where d.id = deal_id));
create policy deal_parts_insert on public.deal_parts for insert to authenticated with check (exists (select 1 from public.deals d where d.id = deal_id));
create policy deal_parts_update on public.deal_parts for update to authenticated using (exists (select 1 from public.deals d where d.id = deal_id)) with check (exists (select 1 from public.deals d where d.id = deal_id));
create policy deal_parts_delete on public.deal_parts for delete to authenticated using (exists (select 1 from public.deals d where d.id = deal_id));
