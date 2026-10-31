-- Успешные продажи → производство: после подтверждения сделки на доске производства
-- (по умолчанию — доска со списком «Продано», например «ProfilDoors Продажа») сама появляется карточка,
-- связанная со сделкой (kanban_cards.deal_id). Одна сделка — одна карточка. Старые сделки не трогаем.
alter table public.crm_settings add column if not exists production_board_id uuid references public.kanban_boards(id) on delete set null;

create or replace function public.production_board_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.production_board_id from crm_settings s join kanban_boards b on b.id = s.production_board_id and not b.archived where s.id = 1),
    (select b.id from kanban_boards b
      where not b.archived and exists (select 1 from kanban_lists l where l.board_id = b.id and not l.archived and l.title = 'Продано')
      order by (b.title ilike '%продаж%') desc, b.created_at limit 1));
$$;
grant execute on function public.production_board_id() to authenticated;

create or replace function public.deal_to_production() returns trigger
language plpgsql security definer set search_path = public as $$
declare b uuid; lst uuid; mgr text; pos double precision;
begin
  if new.status is distinct from 'approved' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then return new; end if;
  if exists (select 1 from kanban_cards where deal_id = new.id) then return new; end if;
  b := production_board_id();
  if b is null then return new; end if;
  select id into lst from kanban_lists where board_id = b and not archived order by (title = 'Продано') desc, position limit 1;
  if lst is null then return new; end if;
  select name into mgr from managers where id = new.manager_id;
  select coalesce(min(position), 1000) - 1 into pos from kanban_cards where list_id = lst and not archived;
  insert into kanban_cards (board_id, list_id, title, description, position, deal_id, address, created_by)
  values (b, lst, coalesce(nullif(trim(new.client_name), ''), 'Клиент'),
          concat_ws(E'\n',
            'Сделка: ' || money_kz(new.total_amount) || ' · оплачено ' || money_kz(coalesce(new.paid_amount, 0)),
            'Телефон: ' || nullif(trim(new.client_phone), ''),
            'Товар: ' || nullif(trim(new.door_model), ''),
            'Договор № ' || nullif(trim(new.contract_number), ''),
            'Менеджер: ' || mgr),
          pos, new.id, nullif(trim(new.address), ''), auth.uid());
  return new;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'deal_to_production' and tgrelid = 'public.deals'::regclass) then
    create trigger deal_to_production after insert or update of status on public.deals
      for each row execute function public.deal_to_production();
  end if;
end $$;
