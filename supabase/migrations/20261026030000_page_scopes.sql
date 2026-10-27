-- «Доступ»: у каждого раздела свой выбор — только свои данные или данные всех менеджеров.
-- employee_permissions.scope_all = true → в этом разделе сотрудник видит всех (с правкой, если включено «Редактирование»).
-- В базе разделы со сделками (Дашборд, Продажи, Должники, Подтверждения, Отчёты) читают одну таблицу,
-- поэтому база пускает к чужим сделкам, если «Все» стоит хотя бы в одном из них; какой раздел что показывает —
-- решает сайт. Деньги компании (Финансы) это не открывает.

alter table public.employee_permissions add column if not exists scope_all boolean not null default false;

create or replace function public.scope_pages(p_area text) returns text[]
language sql immutable as $$
  select case p_area
    when 'deals' then array['dashboard', 'sales', 'debtors', 'approvals', 'reports']
    when 'leads' then array['crm']
    else array[]::text[] end;
$$;

create or replace function public.data_scope(p_area text, p_edit boolean default false) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('director', 'director_view', 'rop'))
      or exists (select 1 from employee_permissions
                 where manager_id = my_manager_id() and scope_all and can_view
                   and page = any (scope_pages(p_area))
                   and (not p_edit or can_edit));
$$;

-- перенос «Сделки/Лиды: все» (и старого «Данные всех менеджеров») в разделы
with src as (
  select manager_id, 'deals' area, bool_or(can_edit) ed from employee_permissions where page in ('scope:deals', 'all_data') and can_view group by 1
  union all
  select manager_id, 'leads', bool_or(can_edit) from employee_permissions where page in ('scope:leads', 'all_data') and can_view group by 1
), defaults(page, v, e) as (
  values ('dashboard', true, true), ('sales', true, true), ('debtors', true, true),
         ('approvals', true, false), ('reports', true, false), ('crm', true, true)
)
insert into employee_permissions (manager_id, page, can_view, can_edit, can_approve, scope_all)
  select s.manager_id, d.page, d.v, d.e, false, true
  from src s join defaults d on d.page = any (scope_pages(s.area))
on conflict (manager_id, page) do update set scope_all = true;
delete from employee_permissions where page in ('scope:deals', 'scope:leads', 'all_data');
