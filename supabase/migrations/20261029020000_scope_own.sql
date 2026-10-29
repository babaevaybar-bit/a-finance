-- «Только свои / Все» теперь и для РОПа и Технолога. По умолчанию они видят всё;
-- scope_own = true в разделе — видят в нём только свои данные.
-- У менеджеров и лидорубов по‑прежнему наоборот: «Все» — scope_all.
alter table public.employee_permissions add column if not exists scope_own boolean not null default false;

create or replace function public.data_scope(p_area text, p_edit boolean default false) returns boolean
language sql stable security definer set search_path = public as $$
  with me as (select role from profiles where id = auth.uid())
  select case
    when (select role from me) in ('director', 'director_view') then true
    when (select role from me) in ('rop', 'technolog') then
      exists (select 1 from unnest(scope_pages(p_area)) as pg(page)
              where not exists (select 1 from employee_permissions e
                                where e.manager_id = my_manager_id() and e.page = pg.page and e.scope_own))
    else exists (select 1 from employee_permissions
                 where manager_id = my_manager_id() and scope_all and can_view
                   and page = any (scope_pages(p_area))
                   and (not p_edit or can_edit))
  end;
$$;
