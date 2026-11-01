-- Карточка производства для сделки — общая функция: её вызывает триггер при подтверждении,
-- а из «Успешных продаж» её можно вызвать вручную для старой сделки, у которой карточки ещё нет.
create or replace function public.production_card_for_deal(p_deal uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare d deals; b uuid; lst uuid; mgr text; pos double precision; cid uuid;
begin
  select * into d from deals where id = p_deal;
  if d.id is null then raise exception 'Сделка не найдена'; end if;
  if auth.uid() is not null and not (data_scope('deals') or d.manager_id = my_manager_id()) then raise exception 'Нет доступа к сделке'; end if;
  select id into cid from kanban_cards where deal_id = p_deal order by created_at limit 1;
  if cid is not null then return cid; end if;
  b := production_board_id();
  if b is null then raise exception 'Нет доски производства — создайте доску со списком «Продано»'; end if;
  select id into lst from kanban_lists where board_id = b and not archived order by (title = 'Продано') desc, position limit 1;
  if lst is null then raise exception 'На доске производства нет списков'; end if;
  select name into mgr from managers where id = d.manager_id;
  select coalesce(min(position), 1000) - 1 into pos from kanban_cards where list_id = lst and not archived;
  insert into kanban_cards (board_id, list_id, title, description, position, deal_id, address, created_by)
  values (b, lst, coalesce(nullif(trim(d.client_name), ''), 'Клиент'),
          concat_ws(E'\n',
            'Сделка: ' || money_kz(d.total_amount) || ' · оплачено ' || money_kz(coalesce(d.paid_amount, 0)),
            'Телефон: ' || nullif(trim(d.client_phone), ''),
            'Товар: ' || nullif(trim(d.door_model), ''),
            'Договор № ' || nullif(trim(d.contract_number), ''),
            'Менеджер: ' || mgr),
          pos, d.id, nullif(trim(d.address), ''), auth.uid())
  returning id into cid;
  return cid;
end $$;
revoke all on function public.production_card_for_deal(uuid) from public, anon;
grant execute on function public.production_card_for_deal(uuid) to authenticated;

create or replace function public.deal_to_production() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from 'approved' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then return new; end if;
  if production_board_id() is null then return new; end if;   -- доски нет — подтверждение не ломаем
  perform production_card_for_deal(new.id);
  return new;
exception when others then
  return new;   -- карточка не создалась — сделка всё равно подтверждается
end $$;
