-- Директор (director_view) настраивается в «Доступе» как РОП/Технолог: по умолчанию видит всё,
-- «Только свои» в разделе ограничивает его своими сделками/лидами/зарплатой. Без ручных настроек ничего не меняется.
create or replace function public.data_scope(p_area text, p_edit boolean default false)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  with me as (select role from profiles where id = auth.uid())
  select case
    when (select role from me) = 'director' then true
    when (select role from me) in ('director_view', 'rop', 'technolog') then
      exists (select 1 from unnest(scope_pages(p_area)) as pg(page)
              where not exists (select 1 from employee_permissions e
                                where e.manager_id = my_manager_id() and e.page = pg.page and e.scope_own))
    else exists (select 1 from employee_permissions
                 where manager_id = my_manager_id() and scope_all and can_view
                   and page = any (scope_pages(p_area))
                   and (not p_edit or can_edit))
  end;
$function$;
